import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import paymentsRouter from './routes/payments.js';

const app = express();

// CORS: allow the Vercel frontend to call this API.
app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
  })
);

// Billplz posts webhooks as x-www-form-urlencoded; the store UI sends JSON.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (Render pings this).
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/payments', paymentsRouter);

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export default app;
