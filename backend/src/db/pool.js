import pg from 'pg';
import 'dotenv/config';

// A single shared connection pool for the whole app.
// Cloud databases (Neon, Render, etc.) require SSL; a local database does not.
// Decide based on the host so it works regardless of NODE_ENV.
const url = process.env.DATABASE_URL || '';
const isLocal = /@(localhost|127\.0\.0\.1)/.test(url);
const pool = new pg.Pool({
  connectionString: url,
  ssl: url && !isLocal ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected idle client error', err);
});

/** Run a single query. */
export const query = (text, params) => pool.query(text, params);

/**
 * Run a function inside a DB transaction. The callback receives a
 * dedicated client; if it throws, everything is rolled back.
 * This is what makes token crediting atomic.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
