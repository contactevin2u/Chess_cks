// Create a test user so you can try the payment flow locally.
// Usage: node src/db/seed.js you@example.com "Your Name"
import pool, { query } from './pool.js';

async function seed() {
  const email = process.argv[2] || 'player@example.com';
  const name = process.argv[3] || 'Test Player';

  const { rows } = await query(
    `INSERT INTO users (email, display_name)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING user_id, email, display_name, token_balance`,
    [email, name]
  );

  console.log('Seeded user:');
  console.table(rows);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
