// ════════════════════════════════════════════════════════════════
//  Payment Controller
//   POST /api/payments/create-bill   -> start a purchase
//   POST /api/payments/webhook       -> Billplz confirms payment
//   GET  /api/payments/packages      -> list packages for the store UI
// ════════════════════════════════════════════════════════════════
import { query, withTransaction } from '../db/pool.js';
import { getPackage, listPackages } from '../config/packages.js';
import {
  createBill,
  verifyXSignature,
} from '../services/billplz.js';

const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;

/** GET /api/payments/packages */
export function getPackages(_req, res) {
  res.json({ packages: listPackages() });
}

/**
 * POST /api/payments/create-bill
 * Body: { userId, packageId }
 *
 * 1. Validate the user + package (price resolved SERVER-side).
 * 2. Create a Pending transaction row.
 * 3. Create the bill on Billplz.
 * 4. Store the returned bill id and hand the payment URL to the client.
 */
export async function createBillHandler(req, res) {
  try {
    const { packageId } = req.body ?? {};
    const userId = req.userId; // set by requireAuth (guest or real account)

    if (!packageId) {
      return res.status(400).json({ error: 'packageId is required' });
    }

    const pkg = getPackage(packageId);
    if (!pkg) {
      return res.status(400).json({ error: 'Unknown packageId' });
    }

    // Look up the buyer (Billplz needs their email/name for the bill).
    const userRes = await query(
      'SELECT user_id, email, display_name FROM users WHERE user_id = $1',
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Billplz requires an email; guests don't have one, so use a placeholder.
    const buyerEmail = user.email || `guest-${user.user_id}@chess.local`;

    // 1) Create the Pending ledger row FIRST so we always have a record.
    const txRes = await query(
      `INSERT INTO transactions (user_id, package_id, amount_paid, tokens_credited, status)
       VALUES ($1, $2, $3, $4, 'Pending')
       RETURNING transaction_id`,
      [user.user_id, pkg.id, pkg.priceCents, pkg.tokens]
    );
    const transactionId = txRes.rows[0].transaction_id;

    // 2) Ask Billplz to create the bill.
    const bill = await createBill({
      amountCents: pkg.priceCents,
      name: user.display_name || 'Chess Player',
      email: buyerEmail,
      description: `${pkg.name} — ${pkg.tokens} tokens`,
      callbackUrl: `${BACKEND_PUBLIC_URL}/api/payments/webhook`,
      redirectUrl: `${FRONTEND_URL}`,
      reference: transactionId,
    });

    // 3) Link the bill id to our transaction.
    await query(
      'UPDATE transactions SET billplz_bill_id = $1 WHERE transaction_id = $2',
      [bill.id, transactionId]
    );

    // 4) Hand the payment page URL to the frontend.
    return res.json({ url: bill.url, transactionId });
  } catch (err) {
    console.error('[create-bill] error', err);
    return res.status(500).json({ error: 'Failed to create bill' });
  }
}

/**
 * POST /api/payments/webhook  (callback_url)
 * Billplz posts here when the bill state changes.
 *
 * Security + correctness:
 *   • Verify X-Signature before trusting anything.
 *   • Idempotent: crediting only happens on a Pending -> Success flip,
 *     guarded by a row lock, so duplicate webhooks never double-credit.
 */
export async function webhookHandler(req, res) {
  try {
    const payload = req.body ?? {};

    // 1) Authenticity: reject anything not signed by Billplz.
    if (!verifyXSignature(payload)) {
      console.warn('[webhook] invalid X-Signature, rejecting');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const billId = payload.id;
    const isPaid = payload.paid === 'true' || payload.paid === true;

    if (!billId) {
      return res.status(400).json({ error: 'Missing bill id' });
    }

    // 2) Do the credit inside a DB transaction with a row lock.
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT transaction_id, user_id, tokens_credited, status
           FROM transactions
          WHERE billplz_bill_id = $1
          FOR UPDATE`,
        [billId]
      );
      const tx = rows[0];

      if (!tx) {
        // Unknown bill — nothing to do, but don't error the webhook.
        console.warn('[webhook] no transaction for bill', billId);
        return;
      }

      // Idempotency guard: only act while still Pending.
      if (tx.status !== 'Pending') {
        console.log('[webhook] already processed', billId, tx.status);
        return;
      }

      if (isPaid) {
        // Credit tokens + mark Success atomically.
        await client.query(
          'UPDATE users SET token_balance = token_balance + $1 WHERE user_id = $2',
          [tx.tokens_credited, tx.user_id]
        );
        await client.query(
          `UPDATE transactions
              SET status = 'Success', paid_at = now()
            WHERE transaction_id = $1`,
          [tx.transaction_id]
        );
        console.log('[webhook] credited', tx.tokens_credited, 'tokens for', billId);
      } else {
        await client.query(
          `UPDATE transactions SET status = 'Failed' WHERE transaction_id = $1`,
          [tx.transaction_id]
        );
        console.log('[webhook] marked Failed', billId);
      }
    });

    // Always 200 so Billplz stops retrying once we've handled it.
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] error', err);
    // 500 => Billplz will retry later, which is safe thanks to idempotency.
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
