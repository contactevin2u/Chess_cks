// ════════════════════════════════════════════════════════════════
//  Wallet Controller — the signed-in user's token balance.
//  credit() is a TEMPORARY demo top-up until Billplz purchases are
//  wired to the frontend; spend() is the real, balance-checked deduct.
// ════════════════════════════════════════════════════════════════
import { query, withTransaction } from '../db/pool.js';

export async function getWallet(req, res) {
  try {
    const { rows } = await query('SELECT token_balance FROM users WHERE user_id = $1', [req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    return res.json({ tokenBalance: rows[0].token_balance });
  } catch (err) {
    console.error('[getWallet]', err);
    return res.status(500).json({ error: 'Failed to load wallet' });
  }
}

// DEMO ONLY — grants free tokens so the shop is usable before Billplz is live.
export async function creditDemo(req, res) {
  try {
    const amount = Math.max(0, Math.min(1000, parseInt(req.body?.amount) || 0));
    const { rows } = await query(
      'UPDATE users SET token_balance = token_balance + $1 WHERE user_id = $2 RETURNING token_balance',
      [amount, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    return res.json({ tokenBalance: rows[0].token_balance });
  } catch (err) {
    console.error('[creditDemo]', err);
    return res.status(500).json({ error: 'Failed to credit tokens' });
  }
}

export async function spend(req, res) {
  const amount = Math.max(0, parseInt(req.body?.amount) || 0);
  try {
    const balance = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT token_balance FROM users WHERE user_id = $1 FOR UPDATE',
        [req.userId]
      );
      if (!rows[0]) { const e = new Error('nouser'); e.code = 'NOUSER'; throw e; }
      if (rows[0].token_balance < amount) { const e = new Error('insufficient'); e.code = 'INSUFF'; throw e; }
      const upd = await client.query(
        'UPDATE users SET token_balance = token_balance - $1 WHERE user_id = $2 RETURNING token_balance',
        [amount, req.userId]
      );
      return upd.rows[0].token_balance;
    });
    return res.json({ tokenBalance: balance });
  } catch (err) {
    if (err.code === 'INSUFF') return res.status(400).json({ error: 'Not enough tokens' });
    if (err.code === 'NOUSER') return res.status(404).json({ error: 'User not found' });
    console.error('[spend]', err);
    return res.status(500).json({ error: 'Failed to spend tokens' });
  }
}
