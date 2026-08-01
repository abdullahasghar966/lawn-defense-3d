// SQLite storage. Uses node:sqlite, which ships with Node — no native module to
// build and no external database to run.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.DB_FILE || join(root, 'data', 'lawn-defense.db');

mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT,
    google_sub    TEXT    UNIQUE,
    display_name  TEXT,
    verified      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  -- One outstanding code per address. Codes are stored as an HMAC, never in the
  -- clear, so a copy of this file does not hand over anybody's inbox.
  CREATE TABLE IF NOT EXISTS otp_codes (
    email      TEXT    PRIMARY KEY,
    code_hash  TEXT    NOT NULL,
    purpose    TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    sent_at    INTEGER NOT NULL
  );

  -- id is a SHA-256 of the cookie value, so a leaked database cannot be replayed
  -- as a live session.
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS progress (
    user_id    INTEGER PRIMARY KEY,
    unlocked   INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

const now = () => Date.now();

// ---------------------------------------------------------------- users

const emailKey = (email) => String(email).trim().toLowerCase();

export const users = {
  byEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(emailKey(email));
  },
  byId(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  byGoogleSub(sub) {
    return db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub);
  },
  create({ email, passwordHash = null, googleSub = null, displayName = null, verified = 0 }) {
    const info = db.prepare(
      `INSERT INTO users (email, password_hash, google_sub, display_name, verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(emailKey(email), passwordHash, googleSub, displayName, verified ? 1 : 0, now());
    return users.byId(Number(info.lastInsertRowid));
  },
  setPassword(id, passwordHash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  },
  markVerified(id) {
    db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(id);
  },
  linkGoogle(id, sub, displayName) {
    db.prepare(
      'UPDATE users SET google_sub = ?, verified = 1, display_name = COALESCE(display_name, ?) WHERE id = ?'
    ).run(sub, displayName, id);
  },
};

// ---------------------------------------------------------------- otp

export const otps = {
  put(email, codeHash, purpose, ttlMs) {
    db.prepare(
      `INSERT INTO otp_codes (email, code_hash, purpose, expires_at, attempts, sent_at)
       VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT(email) DO UPDATE SET
         code_hash = excluded.code_hash,
         purpose = excluded.purpose,
         expires_at = excluded.expires_at,
         attempts = 0,
         sent_at = excluded.sent_at`
    ).run(emailKey(email), codeHash, purpose, now() + ttlMs, now());
  },
  get(email) {
    return db.prepare('SELECT * FROM otp_codes WHERE email = ?').get(emailKey(email));
  },
  bumpAttempts(email) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ?').run(emailKey(email));
  },
  clear(email) {
    db.prepare('DELETE FROM otp_codes WHERE email = ?').run(emailKey(email));
  },
};

// ---------------------------------------------------------------- sessions

export const sessions = {
  create(idHash, userId, ttlMs) {
    db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(idHash, userId, now(), now() + ttlMs);
  },
  get(idHash) {
    return db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').get(idHash, now());
  },
  destroy(idHash) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(idHash);
  },
  purgeExpired() {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
    db.prepare('DELETE FROM otp_codes WHERE expires_at <= ?').run(now());
  },
};

// ---------------------------------------------------------------- progress

export const progress = {
  get(userId) {
    const row = db.prepare('SELECT unlocked FROM progress WHERE user_id = ?').get(userId);
    return row ? row.unlocked : 0;
  },
  // Progress only ever moves forward: a stale client cannot revoke unlocked levels.
  merge(userId, unlocked) {
    db.prepare(
      `INSERT INTO progress (user_id, unlocked, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         unlocked = MAX(progress.unlocked, excluded.unlocked),
         updated_at = excluded.updated_at`
    ).run(userId, unlocked, now());
    return progress.get(userId);
  },
};

setInterval(() => sessions.purgeExpired(), 60 * 60 * 1000).unref();
