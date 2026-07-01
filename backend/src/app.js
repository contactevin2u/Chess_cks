import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import pool from './db/pool.js';
import paymentsRouter from './routes/payments.js';
import authRouter from './routes/auth.js';
import walletRouter from './routes/wallet.js';

const app = express();

// CORS: auth uses bearer tokens (no cookies), so any origin is safe to allow —
// this lets both the Vercel site and locally-opened game files call the API.
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));

// Billplz posts webhooks as x-www-form-urlencoded; the store UI sends JSON.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (Render pings this).
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Config diagnostics — shows which env vars are set (secrets as booleans only).
app.get('/health/config', (_req, res) => {
  const has = (k) => !!process.env[k];
  res.json({
    NODE_ENV: process.env.NODE_ENV || null,
    JWT_SECRET: has('JWT_SECRET'),
    DATABASE_URL: has('DATABASE_URL'),
    FRONTEND_URL: process.env.FRONTEND_URL || null,
    BACKEND_PUBLIC_URL: process.env.BACKEND_PUBLIC_URL || null,
    BILLPLZ_API_URL: process.env.BILLPLZ_API_URL || null,
    BILLPLZ_SECRET_KEY: has('BILLPLZ_SECRET_KEY'),
    BILLPLZ_COLLECTION_ID: has('BILLPLZ_COLLECTION_ID'),
    BILLPLZ_XSIGN_KEY: has('BILLPLZ_XSIGN_KEY'),
    SMTP_HOST: process.env.SMTP_HOST || null,
  });
});

// Billplz key diagnostics — tests the secret key against both environments
// so we can see if it's a sandbox key, a production key, or invalid.
app.get('/health/billplz', async (_req, res) => {
  const key = process.env.BILLPLZ_SECRET_KEY;
  if (!key) return res.json({ error: 'BILLPLZ_SECRET_KEY not set' });
  const auth = 'Basic ' + Buffer.from(key.trim() + ':').toString('base64');
  const test = async (base) => {
    try { const r = await fetch(base + '/collections', { headers: { Authorization: auth } }); return r.status; }
    catch (e) { return 'error: ' + e.message; }
  };
  res.json({
    configuredApiUrl: process.env.BILLPLZ_API_URL || null,
    keyLength: key.length,
    keyLengthAfterTrim: key.trim().length,          // if these differ, there were stray spaces
    sandboxStatus: await test('https://www.billplz-sandbox.com/api/v3'),   // 200 = valid sandbox key
    productionStatus: await test('https://www.billplz.com/api/v3'),        // 200 = valid production key
  });
});

// Database diagnostics — reports connection + table status (no data exposed).
app.get('/health/db', async (_req, res) => {
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  try {
    await pool.query('SELECT 1');
    const t = await pool.query(
      "SELECT to_regclass('public.users') AS users, to_regclass('public.email_otps') AS otps, to_regclass('public.transactions') AS transactions"
    );
    res.json({ hasDatabaseUrl, connected: true, tables: t.rows[0] });
  } catch (err) {
    res.json({ hasDatabaseUrl, connected: false, error: err.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/payments', paymentsRouter);

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export default app;
