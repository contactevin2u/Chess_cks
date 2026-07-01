import express from 'express';
import cors from 'cors';
import 'dotenv/config';

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

app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/payments', paymentsRouter);

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export default app;
