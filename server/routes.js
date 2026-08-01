import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { users, otps, sessions, progress, maybeSweep, storageConfigured } from './db.js';
import { sendOtpEmail, mailConfigured } from './mailer.js';
import { rateLimit, byIp, byIpAndEmail } from './ratelimit.js';
import {
  hashPassword, verifyPassword, fakePasswordWork,
  newSessionToken, hashToken, newOtp, otpMatches,
  validEmail, passwordProblem,
  SESSION_TTL_MS, OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS,
} from './security.js';
// The campaign is the source of truth for how far progress can legitimately go.
import { LEVELS } from '../src/levels.js';

export const COOKIE = 'ld3d_session';
const MAX_LEVEL_INDEX = LEVELS.length - 1;

const isProd = () => process.env.NODE_ENV === 'production';
const googleClientId = () => process.env.GOOGLE_CLIENT_ID || '';

// Built on first use rather than at import, so the configured and unconfigured
// paths are both reachable from one test process.
let cachedGoogleClient = null;
function googleClient() {
  const id = googleClientId();
  if (!id) return null;
  if (!cachedGoogleClient || cachedGoogleClient.id !== id) {
    cachedGoogleClient = { id, client: new OAuth2Client(id) };
  }
  return cachedGoogleClient.client;
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,                 // unreadable from JavaScript, so XSS cannot lift it
    sameSite: 'lax',                // not sent on cross-site POSTs
    secure: isProd(),               // HTTPS-only in production
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Resolves req.user from the session cookie. Never throws; anonymous is fine. */
export async function loadSession(req, res, next) {
  req.user = null;
  try {
    const token = readCookie(req, COOKIE);
    if (token) {
      const row = await sessions.get(hashToken(token));
      if (row) req.user = (await users.byId(row.user_id)) || null;
      else res.clearCookie(COOKIE, { path: '/' });
    }
    void maybeSweep();
  } catch (err) {
    // A storage blip should degrade to "signed out", not a 500 on every page.
    console.error('Session lookup failed:', err.message);
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  next();
}

/**
 * Rejects state-changing requests whose Origin is not this site. SameSite=Lax
 * already blocks the classic cross-site form post; this closes the gap for
 * clients that do not enforce it.
 */
function sameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next(); // same-origin fetches often omit it entirely
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'Bad origin.' });
  }
  if (host !== req.headers.host) return res.status(403).json({ error: 'Cross-origin request refused.' });
  next();
}

const publicUser = (u) => ({
  email: u.email,
  name: u.display_name || u.email.split('@')[0],
  verified: !!u.verified,
  hasPassword: !!u.password_hash,
  linkedGoogle: !!u.google_sub,
});

async function issueSession(res, user) {
  const { token, hash } = newSessionToken();
  await sessions.create(hash, user.id, SESSION_TTL_MS);
  setSessionCookie(res, token);
}

async function startVerification(email, purpose) {
  const { code, hash } = newOtp();
  await otps.put(email, hash, purpose, OTP_TTL_MS);
  await sendOtpEmail(email, code);
}

export const router = Router();

// What the frontend needs to know before rendering the sign-in screen.
router.get('/config', (req, res) => {
  // `dev` lets the sign-in screen explain missing setup instead of silently
  // hiding features. Never sent in production, where players would just be
  // reading someone else's TODO list.
  // Deliberately touches no storage, so it still answers on a misconfigured
  // deployment — that is what tells the client the API exists at all.
  res.json({
    googleClientId: googleClientId(),
    emailDelivery: mailConfigured,
    storage: storageConfigured,
    dev: !isProd(),
  });
});

router.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null, progress: { unlocked: 0 } });
  res.json({ user: publicUser(req.user), progress: { unlocked: await progress.get(req.user.id) } });
});

// ---------------------------------------------------------------- signup

router.post('/auth/signup',
  sameOrigin,
  rateLimit({ limit: 5, windowMs: 15 * 60 * 1000, keyFn: byIpAndEmail, message: 'Too many signup attempts. Try again shortly.' }),
  rateLimit({ limit: 20, windowMs: 60 * 60 * 1000, keyFn: byIp }),
  async (req, res) => {
    const { email, password } = req.body || {};
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });

    const existing = await users.byEmail(email);

    // An address that already has a finished account is never confirmed or denied
    // here — the response below is identical either way, so this endpoint cannot
    // be used to discover who has an account.
    if (existing && existing.verified) {
      return res.json({ ok: true, next: 'verify', message: 'Check your email for a 6-digit code.' });
    }

    const passwordHash = await hashPassword(password);
    if (existing) await users.setPassword(existing.id, passwordHash);
    else await users.create({ email, passwordHash, verified: 0 });

    await startVerification(email, 'signup');
    res.json({ ok: true, next: 'verify', message: 'Check your email for a 6-digit code.' });
  });

router.post('/auth/verify',
  sameOrigin,
  rateLimit({ limit: 10, windowMs: 15 * 60 * 1000, keyFn: byIpAndEmail, message: 'Too many code attempts. Request a new code.' }),
  async (req, res) => {
    const { email, code } = req.body || {};
    if (!validEmail(email) || typeof code !== 'string') {
      return res.status(400).json({ error: 'Enter the 6-digit code we emailed you.' });
    }

    const record = await otps.get(email);
    if (!record) return res.status(400).json({ error: 'That code has expired. Request a new one.' });
    if (record.expires_at <= Date.now()) {
      await otps.clear(email);
      return res.status(400).json({ error: 'That code has expired. Request a new one.' });
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await otps.clear(email);
      return res.status(429).json({ error: 'Too many wrong codes. Request a new one.' });
    }
    if (!otpMatches(code.trim(), record.code_hash)) {
      await otps.bumpAttempts(email);
      return res.status(400).json({ error: 'That code is not right.' });
    }

    const user = await users.byEmail(email);
    if (!user) {
      await otps.clear(email);
      return res.status(400).json({ error: 'That code has expired. Request a new one.' });
    }

    await otps.clear(email);
    await users.markVerified(user.id);
    const fresh = await users.byId(user.id);
    await issueSession(res, fresh);
    res.json({ ok: true, user: publicUser(fresh), progress: { unlocked: await progress.get(user.id) } });
  });

router.post('/auth/resend',
  sameOrigin,
  rateLimit({ limit: 4, windowMs: 15 * 60 * 1000, keyFn: byIpAndEmail, message: 'Please wait before requesting another code.' }),
  async (req, res) => {
    const { email } = req.body || {};
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

    const existing = await otps.get(email);
    if (existing && Date.now() - existing.sent_at < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - existing.sent_at)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
    }

    const user = await users.byEmail(email);
    // Same response whether or not there is anything to send.
    if (user && !user.verified) await startVerification(email, 'signup');
    res.json({ ok: true, message: 'If that address needs verifying, a new code is on its way.' });
  });

// ---------------------------------------------------------------- login

router.post('/auth/login',
  sameOrigin,
  rateLimit({ limit: 8, windowMs: 15 * 60 * 1000, keyFn: byIpAndEmail, message: 'Too many sign-in attempts. Try again shortly.' }),
  rateLimit({ limit: 40, windowMs: 60 * 60 * 1000, keyFn: byIp }),
  async (req, res) => {
    const { email, password } = req.body || {};
    if (!validEmail(email) || typeof password !== 'string') {
      return res.status(400).json({ error: 'Enter your email and password.' });
    }

    const user = await users.byEmail(email);
    if (!user || !user.password_hash) {
      await fakePasswordWork(); // keep the timing indistinguishable
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email or password is incorrect.' });

    // Only revealed to someone who already proved they know the password.
    if (!user.verified) {
      await startVerification(email, 'signup');
      return res.status(403).json({ error: 'Verify your email to finish setting up this account.', next: 'verify' });
    }

    await issueSession(res, user);
    res.json({ ok: true, user: publicUser(user), progress: { unlocked: await progress.get(user.id) } });
  });

// ---------------------------------------------------------------- google

router.post('/auth/google',
  sameOrigin,
  rateLimit({ limit: 20, windowMs: 15 * 60 * 1000, keyFn: byIp }),
  async (req, res) => {
    const client = googleClient();
    if (!client) return res.status(503).json({ error: 'Google sign-in is not configured on this server.' });
    const { credential } = req.body || {};
    if (typeof credential !== 'string' || !credential) {
      return res.status(400).json({ error: 'Missing Google credential.' });
    }

    let payload;
    try {
      // Verifies signature, issuer, expiry and that the token was minted for us.
      const ticket = await client.verifyIdToken({ idToken: credential, audience: googleClientId() });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'Could not verify that Google sign-in.' });
    }

    if (!payload?.sub || !payload.email) return res.status(401).json({ error: 'Google returned an incomplete profile.' });
    if (!payload.email_verified) return res.status(403).json({ error: 'That Google account has an unverified email.' });

    let user = await users.byGoogleSub(payload.sub);
    if (!user) {
      const byEmail = await users.byEmail(payload.email);
      if (byEmail) {
        // Same person arriving a second way — Google has verified the address, so
        // adopting the existing account is safe.
        await users.linkGoogle(byEmail.id, payload.sub, payload.name || null);
        user = await users.byId(byEmail.id);
      } else {
        user = await users.create({
          email: payload.email,
          googleSub: payload.sub,
          displayName: payload.name || null,
          verified: 1,
        });
      }
    }

    await issueSession(res, user);
    res.json({ ok: true, user: publicUser(user), progress: { unlocked: await progress.get(user.id) } });
  });

// ---------------------------------------------------------------- session / progress

router.post('/auth/logout', sameOrigin, async (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) await sessions.destroy(hashToken(token));
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.put('/progress', sameOrigin, requireUser, async (req, res) => {
  const raw = Number(req.body?.unlocked);
  if (!Number.isInteger(raw) || raw < 0 || raw > MAX_LEVEL_INDEX) {
    return res.status(400).json({ error: 'Invalid progress value.' });
  }
  res.json({ ok: true, progress: { unlocked: await progress.merge(req.user.id, raw) } });
});
