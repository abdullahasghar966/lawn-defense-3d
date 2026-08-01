// Storage, over libSQL.
//
// The same client and the same SQL run in both places: a local `file:` database
// in development, and Turso (hosted SQLite) in production. That matters for
// serverless hosts like Vercel, where the filesystem is ephemeral — a local
// SQLite file there would lose every account on each cold start.
//
// Everything is async because a network-backed database cannot be otherwise.
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Serverless platforms give you a read-only filesystem, so falling back to a
// local SQLite file there cannot work — and must not be discovered as an
// EROFS crash at import time, which takes down every route including the ones
// that would explain the problem.
export const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
export const usingRemoteDb = !!process.env.DATABASE_URL;
export const storageConfigured = usingRemoteDb || !isServerless;

function resolveUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = process.env.DB_FILE || join(root, 'data', 'lawn-defense.db');
  mkdirSync(dirname(file), { recursive: true });
  return `file:${file}`;
}

// Built on first use, so a misconfigured deployment surfaces as a clear error
// from the endpoints that need storage rather than a dead function.
let cached = null;
function getClient() {
  if (!storageConfigured) {
    throw new Error(
      'DATABASE_URL is not set. Serverless hosts have no writable disk, so a ' +
      'hosted database is required — see the deployment section of the README.'
    );
  }
  if (!cached) {
    cached = createClient({ url: resolveUrl(), authToken: process.env.DATABASE_AUTH_TOKEN });
  }
  return cached;
}

export const client = {
  execute: (...args) => getClient().execute(...args),
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     email         TEXT    NOT NULL UNIQUE,
     password_hash TEXT,
     google_sub    TEXT    UNIQUE,
     display_name  TEXT,
     verified      INTEGER NOT NULL DEFAULT 0,
     created_at    INTEGER NOT NULL
   )`,
  // One outstanding code per address, stored as an HMAC so a copy of the
  // database does not hand over anybody's inbox.
  `CREATE TABLE IF NOT EXISTS otp_codes (
     email      TEXT    PRIMARY KEY,
     code_hash  TEXT    NOT NULL,
     purpose    TEXT    NOT NULL,
     expires_at INTEGER NOT NULL,
     attempts   INTEGER NOT NULL DEFAULT 0,
     sent_at    INTEGER NOT NULL
   )`,
  // id is a SHA-256 of the cookie value, so a leaked database cannot be
  // replayed as a live session.
  `CREATE TABLE IF NOT EXISTS sessions (
     id         TEXT    PRIMARY KEY,
     user_id    INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS progress (
     user_id    INTEGER PRIMARY KEY,
     unlocked   INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL
   )`,
  // Rate-limit counters live here rather than in memory: serverless runs many
  // instances, and per-process counters would each allow the full quota.
  `CREATE TABLE IF NOT EXISTS rate_limits (
     key      TEXT    PRIMARY KEY,
     count    INTEGER NOT NULL,
     reset_at INTEGER NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)',
];

// Migrations run once per process; concurrent callers share the same promise.
let readyPromise = null;
export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      for (const stmt of SCHEMA) await client.execute(stmt);
    })().catch((err) => {
      readyPromise = null; // let a later request retry rather than wedging
      throw err;
    });
  }
  return readyPromise;
}

const now = () => Date.now();
const emailKey = (email) => String(email).trim().toLowerCase();

async function all(sql, args = []) {
  await ready();
  const res = await client.execute({ sql, args });
  return res.rows;
}

async function one(sql, args = []) {
  const rows = await all(sql, args);
  return rows.length ? rows[0] : undefined;
}

async function run(sql, args = []) {
  await ready();
  return client.execute({ sql, args });
}

// ---------------------------------------------------------------- users

export const users = {
  byEmail: (email) => one('SELECT * FROM users WHERE email = ?', [emailKey(email)]),
  byId: (id) => one('SELECT * FROM users WHERE id = ?', [id]),
  byGoogleSub: (sub) => one('SELECT * FROM users WHERE google_sub = ?', [sub]),

  async create({ email, passwordHash = null, googleSub = null, displayName = null, verified = 0 }) {
    const res = await run(
      `INSERT INTO users (email, password_hash, google_sub, display_name, verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [emailKey(email), passwordHash, googleSub, displayName, verified ? 1 : 0, now()]
    );
    return users.byId(Number(res.lastInsertRowid));
  },

  setPassword: (id, passwordHash) =>
    run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]),

  markVerified: (id) => run('UPDATE users SET verified = 1 WHERE id = ?', [id]),

  linkGoogle: (id, sub, displayName) => run(
    'UPDATE users SET google_sub = ?, verified = 1, display_name = COALESCE(display_name, ?) WHERE id = ?',
    [sub, displayName, id]
  ),
};

// ---------------------------------------------------------------- otp

export const otps = {
  put: (email, codeHash, purpose, ttlMs) => run(
    `INSERT INTO otp_codes (email, code_hash, purpose, expires_at, attempts, sent_at)
     VALUES (?, ?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       code_hash  = excluded.code_hash,
       purpose    = excluded.purpose,
       expires_at = excluded.expires_at,
       attempts   = 0,
       sent_at    = excluded.sent_at`,
    [emailKey(email), codeHash, purpose, now() + ttlMs, now()]
  ),

  get: (email) => one('SELECT * FROM otp_codes WHERE email = ?', [emailKey(email)]),

  bumpAttempts: (email) =>
    run('UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ?', [emailKey(email)]),

  clear: (email) => run('DELETE FROM otp_codes WHERE email = ?', [emailKey(email)]),
};

// ---------------------------------------------------------------- sessions

export const sessions = {
  create: (idHash, userId, ttlMs) => run(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    [idHash, userId, now(), now() + ttlMs]
  ),

  get: (idHash) =>
    one('SELECT * FROM sessions WHERE id = ? AND expires_at > ?', [idHash, now()]),

  destroy: (idHash) => run('DELETE FROM sessions WHERE id = ?', [idHash]),

  async purgeExpired() {
    await run('DELETE FROM sessions WHERE expires_at <= ?', [now()]);
    await run('DELETE FROM otp_codes WHERE expires_at <= ?', [now()]);
    await run('DELETE FROM rate_limits WHERE reset_at <= ?', [now()]);
  },
};

// ---------------------------------------------------------------- progress

export const progress = {
  async get(userId) {
    const row = await one('SELECT unlocked FROM progress WHERE user_id = ?', [userId]);
    return row ? Number(row.unlocked) : 0;
  },

  // Progress only ever moves forward: a stale client cannot revoke levels.
  async merge(userId, unlocked) {
    await run(
      `INSERT INTO progress (user_id, unlocked, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         unlocked   = MAX(progress.unlocked, excluded.unlocked),
         updated_at = excluded.updated_at`,
      [userId, unlocked, now()]
    );
    return progress.get(userId);
  },
};

// ---------------------------------------------------------------- rate limits

export const rateLimits = {
  /** Atomically bumps a fixed window and reports whether the caller is over it. */
  async hit(key, limit, windowMs) {
    const t = now();
    const resetAt = t + windowMs;
    const res = await run(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count    = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= ? THEN ? ELSE rate_limits.reset_at END
       RETURNING count, reset_at`,
      [key, resetAt, t, t, resetAt]
    );
    const row = res.rows[0];
    const count = Number(row.count);
    const until = Number(row.reset_at);
    return { ok: count <= limit, retryAfter: Math.max(1, Math.ceil((until - t) / 1000)) };
  },
};

// Serverless has no long-lived process to hang an interval on, so expired rows
// are swept opportunistically on a small fraction of requests instead.
export async function maybeSweep() {
  if (Math.random() > 0.02) return;
  try {
    await sessions.purgeExpired();
  } catch {
    /* housekeeping is best-effort */
  }
}
