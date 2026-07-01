// ════════════════════════════════════════════════════════════════
//  Auth Controller — register, login, me, forgot/reset password
// ════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signToken } from '../auth/jwt.js';
import { sendMail } from '../services/mailer.js';

const publicUser = (u) => ({
  userId: u.user_id,
  email: u.email,
  displayName: u.display_name,
  tokenBalance: u.token_balance,
});

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000)); // 6 digits

// Step 1 of sign-up: email an OTP to verify the address (no account yet).
export async function requestOtp(req, res) {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email' });

    const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'That email is already registered — try signing in' });

    const code = genOtp();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await query(
      `INSERT INTO email_otps (email, code, expires_at, attempts)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (email) DO UPDATE SET code = $2, expires_at = $3, attempts = 0, created_at = now()`,
      [email, code, expires]
    );
    const sent = await sendMail({
      to: email,
      subject: 'Your Chess verification code',
      html: `<p>Your verification code is:</p>
             <h2 style="letter-spacing:6px">${code}</h2>
             <p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`,
    });
    // Dev convenience when SMTP isn't configured: return the code so it's testable.
    if (!sent && process.env.NODE_ENV !== 'production') return res.json({ ok: true, devOtp: code });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[requestOtp]', err);
    return res.status(500).json({ error: 'Failed to send verification code' });
  }
}

// Step 2 of sign-up: check the OTP, then create the account.
export async function verifyOtp(req, res) {
  try {
    let { email, code, password, displayName } = req.body ?? {};
    email = (email || '').trim().toLowerCase();
    if (!validEmail(email) || !code) return res.status(400).json({ error: 'Email and code required' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const { rows } = await query('SELECT * FROM email_otps WHERE email = $1', [email]);
    const rec = rows[0];
    if (!rec || new Date(rec.expires_at) < new Date()) return res.status(400).json({ error: 'Code expired — request a new one' });
    if (rec.attempts >= 5) return res.status(429).json({ error: 'Too many attempts — request a new code' });
    if (String(code).trim() !== rec.code) {
      await query('UPDATE email_otps SET attempts = attempts + 1 WHERE email = $1', [email]);
      return res.status(400).json({ error: 'Incorrect code' });
    }

    const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'That email is already registered' });

    const hash = await hashPassword(password);
    const ins = await query(
      'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [email, displayName?.trim() || null, hash]
    );
    await query('DELETE FROM email_otps WHERE email = $1', [email]);
    const user = ins.rows[0];
    return res.status(201).json({ token: signToken(user.user_id), user: publicUser(user) });
  } catch (err) {
    console.error('[verifyOtp]', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
}

export async function register(req, res) {
  try {
    let { email, password, displayName } = req.body ?? {};
    email = (email || '').trim().toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'That email is already registered' });

    const hash = await hashPassword(password);
    const { rows } = await query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3) RETURNING *`,
      [email, displayName?.trim() || null, hash]
    );
    const user = rows[0];
    return res.status(201).json({ token: signToken(user.user_id), user: publicUser(user) });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
}

export async function login(req, res) {
  try {
    let { email, password } = req.body ?? {};
    email = (email || '').trim().toLowerCase();
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password' });

    return res.json({ token: signToken(user.user_id), user: publicUser(user) });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Login failed' });
  }
}

export async function me(req, res) {
  try {
    const { rows } = await query('SELECT * FROM users WHERE user_id = $1', [req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ error: 'Failed to load account' });
  }
}

export async function forgotPassword(req, res) {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { rows } = await query('SELECT user_id FROM users WHERE email = $1', [email]);
    // Always respond OK so we never reveal whether an email is registered.
    if (rows[0]) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await query(
        'INSERT INTO password_resets (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [token, rows[0].user_id, expires]
      );
      const link = `${process.env.FRONTEND_URL || ''}/reset-password?token=${token}`;
      const sent = await sendMail({
        to: email,
        subject: 'Reset your Chess password',
        html: `<p>We received a request to reset your password.</p>
               <p><a href="${link}">Click here to reset it</a> (valid for 30 minutes).</p>
               <p>If you didn't request this, you can ignore this email.</p>`,
      });
      // Dev convenience: when SMTP isn't set up, return the link so it's testable.
      if (!sent && process.env.NODE_ENV !== 'production') {
        return res.json({ ok: true, devResetToken: token, devResetLink: link });
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[forgotPassword]', err);
    return res.status(500).json({ error: 'Failed to start password reset' });
  }
}

export async function resetPassword(req, res) {
  try {
    const { token, password } = req.body ?? {};
    if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const { rows } = await query('SELECT * FROM password_resets WHERE token = $1', [token]);
    const pr = rows[0];
    if (!pr || pr.used || new Date(pr.expires_at) < new Date())
      return res.status(400).json({ error: 'This reset link is invalid or has expired' });

    const hash = await hashPassword(password);
    await query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, pr.user_id]);
    await query('UPDATE password_resets SET used = true WHERE token = $1', [token]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[resetPassword]', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
}
