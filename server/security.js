// Password hashing, session tokens and OTP generation — all on node:crypto.
import {
  randomBytes, randomInt, scrypt, timingSafeEqual, createHash, createHmac,
} from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const OTP_TTL_MS = 10 * 60 * 1000;               // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * The server secret. Used to HMAC one-time codes so a stolen database cannot be
 * brute-forced offline — a 6-digit code is only a million guesses otherwise.
 * A random fallback keeps dev running but invalidates sessions on every restart,
 * which is the correct nag: production must set this.
 */
export const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
export const SECRET_IS_EPHEMERAL = !process.env.SESSION_SECRET;

// ---------------------------------------------------------------- passwords

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  let actual;
  try {
    actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_PARAMS);
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Burns roughly the same CPU as a real password check. Called when the account
 * does not exist so that "no such user" and "wrong password" take the same time
 * and cannot be told apart by a stopwatch.
 */
export async function fakePasswordWork() {
  await scryptAsync('decoy', randomBytes(16), KEYLEN, SCRYPT_PARAMS);
}

// ---------------------------------------------------------------- sessions

export function newSessionToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// ---------------------------------------------------------------- one-time codes

export function newOtp() {
  // randomInt is rejection-sampled, so every code is equally likely.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return { code, hash: hashOtp(code) };
}

export const hashOtp = (code) =>
  createHmac('sha256', SESSION_SECRET).update(String(code)).digest('hex');

export function otpMatches(code, storedHash) {
  const a = Buffer.from(hashOtp(code), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- validation

// Deliberately permissive: the address is proven by the code we email to it,
// not by a regex trying to out-guess RFC 5322.
export function validEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length >= 3 && trimmed.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function passwordProblem(password) {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 200) return 'Password must be under 200 characters.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}
