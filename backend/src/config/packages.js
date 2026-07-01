// ════════════════════════════════════════════════════════════════
//  Token Packages — the SINGLE source of truth for pricing.
//
//  SECURITY: the client only ever sends a `packageId`. The price and
//  token amount are resolved HERE on the server, so a malicious user
//  can never pay RM1 and ask for 1,000,000 tokens.
//
//  priceCents is what Billplz's API expects (amount in cents).
//  RM10.00 => 1000 cents.
// ════════════════════════════════════════════════════════════════

export const TOKEN_PACKAGES = {
  starter: {
    id: 'starter',
    name: 'Starter Pack',
    priceCents: 1000, // RM10.00
    tokens: 100,
  },
  plus: {
    id: 'plus',
    name: 'Plus Pack',
    priceCents: 2500, // RM25.00
    tokens: 275, // small bonus
  },
  pro: {
    id: 'pro',
    name: 'Pro Pack',
    priceCents: 5000, // RM50.00
    tokens: 600, // bigger bonus
  },
  grandmaster: {
    id: 'grandmaster',
    name: 'Grandmaster Pack',
    priceCents: 10000, // RM100.00
    tokens: 1300,
  },
};

/** Resolve a package by id, or return null if it doesn't exist. */
export function getPackage(packageId) {
  return TOKEN_PACKAGES[packageId] ?? null;
}

/** Public list for the store UI (no server-only internals to hide, but tidy). */
export function listPackages() {
  return Object.values(TOKEN_PACKAGES).map((p) => ({
    id: p.id,
    name: p.name,
    priceMYR: (p.priceCents / 100).toFixed(2),
    priceCents: p.priceCents,
    tokens: p.tokens,
  }));
}
