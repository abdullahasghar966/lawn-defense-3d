// Auth API tests. Boots the real Express app against a throwaway SQLite file on
// an ephemeral port and drives it over HTTP.
//
// Verification codes are never exposed by the server, so where a test needs to
// know one it overwrites the stored hash with a code of its own — the same path
// a real code takes through verification.
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DB_FILE = join(tmpdir(), `ld3d-auth-test-${process.pid}.db`);
process.env.DB_FILE = DB_FILE;
process.env.SESSION_SECRET = 'test-secret-not-for-production';
process.env.NODE_ENV = 'test';
delete process.env.GOOGLE_CLIENT_ID;

const { createApp } = await import('../server/app.js');
const { otps, users } = await import('../server/db.js');
const { hashOtp } = await import('../server/security.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const server = createApp().listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

/** Minimal cookie jar so session continuity behaves like a browser's. */
function jar() {
  let cookie = '';
  return {
    get header() { return cookie; },
    async call(path, { method = 'GET', body, origin = base } = {}) {
      const headers = {};
      if (body) headers['Content-Type'] = 'application/json';
      if (cookie) headers.Cookie = cookie;
      if (origin) headers.Origin = origin;
      const res = await fetch(base + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
      });
      const setCookie = res.headers.getSetCookie?.() || [];
      for (const c of setCookie) {
        const pair = c.split(';')[0];
        if (pair.startsWith('ld3d_session=')) cookie = pair.endsWith('=') ? '' : pair;
      }
      let data = {};
      try { data = await res.json(); } catch { /* no body */ }
      return { status: res.status, data };
    },
  };
}

/** Replaces whatever code was mailed with one the test knows. */
function plantCode(email, code = '123456') {
  otps.put(email, hashOtp(code), 'signup', 10 * 60 * 1000);
  return code;
}

const PW = 'lawnDefense1';

console.log('1. Signup issues a code and does not sign you in yet');
{
  const c = jar();
  const r = await c.call('/api/auth/signup', { method: 'POST', body: { email: 'a@example.com', password: PW } });
  check('signup accepted', r.status === 200 && r.data.next === 'verify');
  check('no session cookie before verification', c.header === '');
  const me = await c.call('/api/me');
  check('/me is anonymous', me.data.user === null);
  check('account exists but is unverified', users.byEmail('a@example.com')?.verified === 0);
}

console.log('2. Weak input is rejected');
{
  const c = jar();
  const bad = await c.call('/api/auth/signup', { method: 'POST', body: { email: 'nope', password: PW } });
  check('invalid email refused', bad.status === 400);
  const short = await c.call('/api/auth/signup', { method: 'POST', body: { email: 'b@example.com', password: 'abc' } });
  check('short password refused', short.status === 400);
  const letters = await c.call('/api/auth/signup', { method: 'POST', body: { email: 'b@example.com', password: 'abcdefghij' } });
  check('password with no digit refused', letters.status === 400);
}

console.log('3. Verification: wrong code fails, right code signs you in');
{
  const c = jar();
  await c.call('/api/auth/signup', { method: 'POST', body: { email: 'v@example.com', password: PW } });
  plantCode('v@example.com', '654321');
  const wrong = await c.call('/api/auth/verify', { method: 'POST', body: { email: 'v@example.com', code: '000000' } });
  check('wrong code rejected', wrong.status === 400);
  check('still no session', c.header === '');
  const ok = await c.call('/api/auth/verify', { method: 'POST', body: { email: 'v@example.com', code: '654321' } });
  check('correct code accepted', ok.status === 200 && ok.data.user.email === 'v@example.com');
  check('session cookie issued', c.header.startsWith('ld3d_session='));
  const me = await c.call('/api/me');
  check('/me now returns the user', me.data.user?.email === 'v@example.com');
  const reuse = await c.call('/api/auth/verify', { method: 'POST', body: { email: 'v@example.com', code: '654321' } });
  check('code cannot be reused', reuse.status === 400);
}

console.log('4. Codes expire and burn out after repeated guesses');
{
  const c = jar();
  await c.call('/api/auth/signup', { method: 'POST', body: { email: 'e@example.com', password: PW } });
  otps.put('e@example.com', hashOtp('111111'), 'signup', -1000); // already expired
  const expired = await c.call('/api/auth/verify', { method: 'POST', body: { email: 'e@example.com', code: '111111' } });
  check('expired code rejected', expired.status === 400);

  plantCode('x@example.com', '222222');
  let lastStatus = 0;
  for (let i = 0; i < 6; i++) {
    const r = await c.call('/api/auth/verify', { method: 'POST', body: { email: 'x@example.com', code: '999999' } });
    lastStatus = r.status;
  }
  check('repeated wrong guesses stop being accepted', lastStatus === 400 || lastStatus === 429);
  check('burnt code is discarded', otps.get('x@example.com') === undefined);
}

console.log('5. Login');
{
  const c = jar();
  const wrong = await c.call('/api/auth/login', { method: 'POST', body: { email: 'v@example.com', password: 'wrongPass1' } });
  check('wrong password rejected', wrong.status === 401);
  check('error does not say whether the account exists', /incorrect/i.test(wrong.data.error));

  const missing = await c.call('/api/auth/login', { method: 'POST', body: { email: 'ghost@example.com', password: PW } });
  check('unknown account gives the same message', missing.status === 401 && missing.data.error === wrong.data.error);

  const ok = await c.call('/api/auth/login', { method: 'POST', body: { email: 'v@example.com', password: PW } });
  check('correct password signs in', ok.status === 200 && ok.data.user.email === 'v@example.com');

  const out = await c.call('/api/auth/logout', { method: 'POST' });
  check('logout succeeds', out.status === 200);
  const me = await c.call('/api/me');
  check('session is gone after logout', me.data.user === null);
}

console.log('6. Unverified accounts are routed back to verification');
{
  const c = jar();
  await c.call('/api/auth/signup', { method: 'POST', body: { email: 'u@example.com', password: PW } });
  const r = await c.call('/api/auth/login', { method: 'POST', body: { email: 'u@example.com', password: PW } });
  check('correct password on unverified account asks for the code', r.status === 403 && r.data.next === 'verify');
}

console.log('7. Signup cannot be used to discover existing accounts');
{
  const c = jar();
  const before = users.byEmail('v@example.com').password_hash;
  const r = await c.call('/api/auth/signup', { method: 'POST', body: { email: 'v@example.com', password: 'attackerPass9' } });
  const after = users.byEmail('v@example.com').password_hash;
  check('response is the same as a fresh signup', r.status === 200 && r.data.next === 'verify');
  check('existing password is NOT overwritten', before === after);
}

console.log('8. Progress is per-account and only moves forward');
{
  const c = jar();
  const anon = await c.call('/api/progress', { method: 'PUT', body: { unlocked: 5 } });
  check('anonymous progress write refused', anon.status === 401);

  await c.call('/api/auth/login', { method: 'POST', body: { email: 'v@example.com', password: PW } });
  const up = await c.call('/api/progress', { method: 'PUT', body: { unlocked: 4 } });
  check('progress saved', up.status === 200 && up.data.progress.unlocked === 4);

  const down = await c.call('/api/progress', { method: 'PUT', body: { unlocked: 1 } });
  check('a stale client cannot revoke unlocked levels', down.data.progress.unlocked === 4);

  const tooFar = await c.call('/api/progress', { method: 'PUT', body: { unlocked: 999 } });
  check('out-of-range progress refused', tooFar.status === 400);

  const me = await c.call('/api/me');
  check('/me reports stored progress', me.data.progress.unlocked === 4);
}

console.log('9. Cross-origin writes are refused');
{
  const c = jar();
  const r = await c.call('/api/auth/login', {
    method: 'POST', body: { email: 'v@example.com', password: PW }, origin: 'http://evil.example',
  });
  check('foreign Origin blocked', r.status === 403);
}

console.log('10. Google sign-in is disabled without a client ID');
{
  const c = jar();
  const cfg = await c.call('/api/config');
  check('config advertises no Google client', cfg.data.googleClientId === '');
  const r = await c.call('/api/auth/google', { method: 'POST', body: { credential: 'fake.token.here' } });
  check('endpoint refuses rather than trusting the token', r.status === 503);
}

console.log('11. Brute force is rate limited');
{
  const c = jar();
  let sawLimit = false;
  for (let i = 0; i < 12 && !sawLimit; i++) {
    const r = await c.call('/api/auth/login', { method: 'POST', body: { email: 'rl@example.com', password: `nope${i}A` } });
    if (r.status === 429) sawLimit = true;
  }
  check('repeated failed logins get throttled', sawLimit);
}

await new Promise((r) => server.close(r));
try {
  await rm(DB_FILE, { force: true });
  await rm(`${DB_FILE}-wal`, { force: true });
  await rm(`${DB_FILE}-shm`, { force: true });
} catch { /* best effort */ }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
