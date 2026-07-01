// Simple migration runner: executes schema.sql against DATABASE_URL.
// Usage: npm run migrate
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pool from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] Applying schema...');
  await pool.query(sql);
  console.log('[migrate] Done ✅');
  await pool.end();
}

migrate().catch((err) => {
  console.error('[migrate] Failed ❌', err);
  process.exit(1);
});
