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
