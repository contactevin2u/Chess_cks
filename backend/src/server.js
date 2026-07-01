import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import app from './app.js';
import pool from './db/pool.js';
import { attachGameServer } from './realtime/gameServer.js';

const PORT = process.env.PORT || 8080;

// Auto-migrate on startup: apply schema.sql so the tables exist without
// needing shell access (Render's free tier has no shell). The schema is
// idempotent (CREATE TABLE IF NOT EXISTS / ALTER ... IF NOT EXISTS), so
// it's safe to run on every boot.
async function autoMigrate() {
  if (!process.env.DATABASE_URL) {
    console.warn('[migrate] DATABASE_URL not set — skipping (accounts/payments will be disabled)');
    return;
  }
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const sql = await readFile(join(__dirname, 'db', 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('[migrate] database schema applied ✅');
  } catch (err) {
    console.error('[migrate] failed:', err.message);
  }
}

const server = http.createServer(app);
attachGameServer(server);

// Try to migrate first, then start listening either way.
autoMigrate().finally(() => {
  server.listen(PORT, () => console.log(`♟️  Chess backend listening on port ${PORT}`));
});
