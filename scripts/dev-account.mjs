// Local admin helper for development.
//
//   node scripts/dev-account.mjs <email>            mint a fresh verification code
//   node scripts/dev-account.mjs <email> --verify   skip the code, mark verified
//   node scripts/dev-account.mjs --list             show known accounts
//
// This needs direct access to the SQLite file, so it is not a way around the
// login from anywhere but this machine. It still refuses to run in production.
import 'dotenv/config';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run with NODE_ENV=production. This is a development tool.');
  process.exit(1);
}

const { users, otps, client, ready } = await import('../server/db.js');
await ready();
const { newOtp, OTP_TTL_MS, SECRET_IS_EPHEMERAL } = await import('../server/security.js');

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'));
const wantVerify = args.includes('--verify');

if (args.includes('--list') || !email) {
  const rows = (await client.execute('SELECT email, verified, google_sub FROM users ORDER BY created_at')).rows;
  if (!rows.length) {
    console.log('No accounts yet.');
  } else {
    console.log('\nAccounts:');
    for (const r of rows) {
      const how = r.google_sub ? 'google' : 'password';
      console.log(`  ${r.verified ? '[verified]  ' : '[unverified]'} ${r.email}  (${how})`);
    }
  }
  if (!email) {
    console.log('\nUsage: node scripts/dev-account.mjs <email> [--verify]\n');
  }
  process.exit(0);
}

const user = await users.byEmail(email);
if (!user) {
  console.error(`No account for ${email}. Sign up in the browser first.`);
  process.exit(1);
}

if (wantVerify) {
  await users.markVerified(user.id);
  await otps.clear(email);
  console.log(`\n  ${email} is now verified. Sign in with your password.\n`);
  process.exit(0);
}

if (SECRET_IS_EPHEMERAL) {
  console.error([
    '',
    '  SESSION_SECRET is not set.',
    '',
    '  Codes are signed with it, and the running server generated its own random',
    '  one at startup — so a code minted here would not match and would be',
    '  rejected. Fix it one of two ways:',
    '',
    '    1. Set SESSION_SECRET in .env, restart the server, then re-run this.',
    '    2. Or just skip the code:  node scripts/dev-account.mjs ' + email + ' --verify',
    '',
  ].join('\n'));
  process.exit(1);
}

const { code, hash } = newOtp();
await otps.put(email, hash, 'signup', OTP_TTL_MS);
console.log(`\n  Verification code for ${email}: ${code}`);
console.log('  Valid for 10 minutes.\n');
