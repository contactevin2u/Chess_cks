import nodemailer from 'nodemailer';

// Lazily build an SMTP transporter from env vars. If SMTP isn't configured,
// sendMail() becomes a no-op (and the caller can fall back to a dev link).
let cached; // undefined = not tried, false = unconfigured, object = transporter

function getTransporter() {
  if (cached !== undefined) return cached;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) { cached = false; return false; }
  cached = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return cached;
}

/** Returns true if the mail was actually sent, false if SMTP isn't configured. */
export async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured — would email ${to}: ${subject}`);
    return false;
  }
  await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html });
  return true;
}
