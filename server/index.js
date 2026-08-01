// Lawn Defense 3D — game server.
//
// Serves the static game and a small auth API. Signing in is optional: guests
// keep playing exactly as before with progress in localStorage, while signed-in
// players get their progress stored server-side.
import 'dotenv/config';
import { createApp } from './app.js';
import { verifyMailer, mailConfigured } from './mailer.js';
import { SECRET_IS_EPHEMERAL } from './security.js';

const port = Number(process.env.PORT || 5173);
const isProd = process.env.NODE_ENV === 'production';

if (isProd && SECRET_IS_EPHEMERAL) {
  console.error('Refusing to start: SESSION_SECRET must be set when NODE_ENV=production.');
  process.exit(1);
}

createApp().listen(port, async () => {
  console.log(`\n  Lawn Defense 3D  ->  http://localhost:${port}\n`);

  const notes = [];
  if (SECRET_IS_EPHEMERAL) {
    notes.push('SESSION_SECRET is unset — a random one is in use, so every restart signs everybody out.');
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    notes.push('GOOGLE_CLIENT_ID is unset — the Google button is hidden.');
  }
  if (!mailConfigured) {
    notes.push('SMTP_* is unset — verification codes print to this console instead of being emailed.');
  } else if (!(await verifyMailer())) {
    notes.push('SMTP is configured but the connection test failed — codes will print here instead.');
  }
  if (notes.length) {
    console.log('  Setup notes (see .env.example):');
    for (const n of notes) console.log(`   - ${n}`);
    console.log('');
  }
});
