-- ════════════════════════════════════════════════════════════════
--  Chess Game — Wallet & Token Schema (PostgreSQL)
-- ════════════════════════════════════════════════════════════════
--  Design goals:
--   • token_balance is the single source of truth for a user's tokens
--   • Every balance change is backed by a transactions row (audit trail)
--   • Idempotency: a Billplz bill can only ever be credited ONCE
--   • Money is stored in integer cents — never floats
-- ════════════════════════════════════════════════════════════════

-- Enum for the lifecycle of a payment
DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('Pending', 'Success', 'Failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── USERS / WALLET ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    display_name  TEXT,
    -- bcrypt hash of the password (NULL for accounts created without a password)
    password_hash TEXT,
    -- The wallet. Tokens are NON-withdrawable, in-ecosystem only.
    token_balance INTEGER NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- For existing databases created before auth was added:
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ── PASSWORD RESETS (forgot-password flow) ──────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
    token       TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- ── EMAIL OTP (verify address before an account is created) ─────
CREATE TABLE IF NOT EXISTS email_otps (
    email       TEXT PRIMARY KEY,
    code        TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── TRANSACTIONS (audit ledger for every purchase) ──────────────
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Which package was bought (server-side definition, e.g. 'starter')
    package_id       TEXT NOT NULL,

    -- Billplz linkage. UNIQUE => the DB itself blocks double-crediting.
    billplz_bill_id  TEXT UNIQUE,

    amount_paid      INTEGER NOT NULL,        -- in cents (MYR), e.g. RM10 = 1000
    tokens_credited  INTEGER NOT NULL,        -- tokens this purchase grants
    status           transaction_status NOT NULL DEFAULT 'Pending',

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at          TIMESTAMPTZ              -- set when webhook confirms payment
);

CREATE INDEX IF NOT EXISTS idx_transactions_user   ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_bill   ON transactions(billplz_bill_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- ── Convenience: keep updated_at fresh on users ─────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_touch ON users;
CREATE TRIGGER trg_users_touch
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
