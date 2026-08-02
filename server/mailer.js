// Email delivery for one-time codes.
//
// With SMTP configured the code is emailed. Without it, the code is printed to
// the server console so the whole signup flow still works on a fresh clone with
// no credentials — see .env.example.
import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.MAIL_FROM || 'Lawn Defense 3D <no-reply@localhost>';

export const mailConfigured = Boolean(host && user && pass);

const transport = mailConfigured
  ? nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 is implicit TLS; 587 upgrades via STARTTLS
    auth: { user, pass },
    // Serverless functions are killed at a hard time limit. Without these an
    // unreachable mail host hangs until the platform kills the whole request,
    // which looks like a crash rather than "email is misconfigured".
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  : null;

export async function sendOtpEmail(to, code) {
  if (!transport) {
    if (process.env.NODE_ENV === 'test') return { delivered: false };
    // Console fallback. Loud on purpose — it must never be mistaken for delivery.
    console.log('\n' + '='.repeat(58));
    console.log('  SMTP is not configured, so no email was sent.');
    console.log(`  Verification code for ${to}: ${code}`);
    console.log('  Set SMTP_* in .env to deliver these for real.');
    console.log('='.repeat(58) + '\n');
    return { delivered: false };
  }

  // Callers decide what to do with a failure; they must not let it escape as a
  // 500, because by this point the account and code already exist.
  await transport.sendMail({
    from,
    to,
    subject: `${code} is your Lawn Defense 3D verification code`,
    text: [
      `Your verification code is ${code}`,
      '',
      'It expires in 10 minutes.',
      "If you didn't try to sign up, you can ignore this email.",
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,Segoe UI,sans-serif;max-width:460px">
        <h2 style="color:#4a7a2a;margin-bottom:4px">Lawn Defense 3D</h2>
        <p style="color:#444">Your verification code is:</p>
        <p style="font-size:34px;font-weight:700;letter-spacing:9px;color:#2a4a10;margin:18px 0">${code}</p>
        <p style="color:#666;font-size:14px">It expires in 10 minutes.</p>
        <p style="color:#999;font-size:12px">If you didn't try to sign up, you can ignore this email.</p>
      </div>`,
  });
  return { delivered: true };
}

export async function verifyMailer() {
  if (!transport) return false;
  try {
    await transport.verify();
    return true;
  } catch (err) {
    console.warn('SMTP verify failed — codes will fall back to the console:', err.message);
    return false;
  }
}
