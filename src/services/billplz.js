// ════════════════════════════════════════════════════════════════
//  Billplz Service
//  • createBill()          -> server-side call to create a payment
//  • verifyXSignature()    -> verify webhook (callback) authenticity
//  • verifyRedirectSignature() -> verify the browser redirect params
//
//  Billplz signs payloads with HMAC-SHA256 using your X-Signature Key.
//  We recompute the signature and compare it in constant time.
// ════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import 'dotenv/config';

// Read env lazily (inside functions) rather than at import time, so the
// module works regardless of import order and is easy to test.
const env = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

// Billplz uses HTTP Basic Auth: username = API secret key, password = empty.
function authHeader() {
  const token = Buffer.from(`${env('BILLPLZ_SECRET_KEY')}:`).toString('base64');
  return `Basic ${token}`;
}

/**
 * Create a bill on Billplz.
 * @returns {Promise<{id: string, url: string}>}
 */
export async function createBill({ amountCents, name, email, description, callbackUrl, redirectUrl, reference }) {
  // Billplz expects application/x-www-form-urlencoded
  const body = new URLSearchParams({
    collection_id: env('BILLPLZ_COLLECTION_ID'),
    email,
    name,
    amount: String(amountCents), // MUST be in cents
    description,
    callback_url: callbackUrl,
    redirect_url: redirectUrl,
    // reference_1 lets us stash our own transaction id for cross-checking
    reference_1_label: 'TransactionId',
    reference_1: reference,
  });

  const res = await fetch(`${env('BILLPLZ_API_URL')}/bills`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Billplz createBill failed (${res.status}): ${msg}`);
  }

  return { id: data.id, url: data.url };
}

// ── Signature verification ──────────────────────────────────────

/** Constant-time string comparison to avoid timing attacks. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Build the signature source string the Billplz way:
 *   for each key (except x_signature): concatenate `key` + `value`
 *   sort those strings ascending, then join with '|'.
 * Then HMAC-SHA256 with the X-Signature Key.
 */
function computeSignature(params) {
  const source = Object.keys(params)
    .filter((k) => k !== 'x_signature')
    .map((k) => `${k}${params[k]}`)
    .sort()
    .join('|');

  return crypto
    .createHmac('sha256', env('BILLPLZ_XSIGN_KEY'))
    .update(source)
    .digest('hex');
}

/**
 * Verify a WEBHOOK (callback_url) payload.
 * The webhook body arrives as flat form fields, e.g.
 *   { id, collection_id, paid, state, amount, ..., x_signature }
 */
export function verifyXSignature(body) {
  const received = body?.x_signature;
  if (!received) return false;
  const expected = computeSignature(body);
  return safeEqual(expected, received);
}

/**
 * Verify a REDIRECT (redirect_url) query string.
 * Billplz sends these as bracketed params, e.g.
 *   billplz[id], billplz[paid], billplz[paid_at], billplz[x_signature]
 * We flatten `billplz[id]` -> `billplzid` before signing.
 */
export function verifyRedirectSignature(query) {
  const flat = {};
  for (const [key, value] of Object.entries(query)) {
    const match = key.match(/^billplz\[(.+)\]$/);
    if (match) flat[`billplz${match[1]}`] = value;
  }

  const received = flat['billplzx_signature'];
  if (!received) return false;

  const source = Object.keys(flat)
    .filter((k) => k !== 'billplzx_signature')
    .map((k) => `${k}${flat[k]}`)
    .sort()
    .join('|');

  const expected = crypto
    .createHmac('sha256', env('BILLPLZ_XSIGN_KEY'))
    .update(source)
    .digest('hex');
  return safeEqual(expected, received);
}
