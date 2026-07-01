# Chess Backend — Wallet, Tokens & Billplz

Node.js + Express API for the chess game. Handles the **Tokens** in-app
currency and **Billplz** (MYR) payments. Tokens are purchase-only and
**cannot be withdrawn or cashed out** — they are spendable only inside the
game ecosystem.

## Stack
- **Express** (ESM)
- **PostgreSQL** via `pg` (ACID — critical for a wallet)
- Deployed on **Render**

## Project layout
```
backend/
├── .env.example
├── package.json
└── src/
    ├── server.js               # entrypoint
    ├── app.js                  # express app + middleware
    ├── config/packages.js      # server-side token package prices
    ├── db/
    │   ├── pool.js             # pg pool + withTransaction() helper
    │   ├── schema.sql          # users + transactions tables
    │   ├── migrate.js          # `npm run migrate`
    │   └── seed.js             # create a test user
    ├── services/billplz.js     # Billplz API call + X-Signature verify
    ├── controllers/paymentController.js
    └── routes/payments.js
```

## Setup
```bash
cd backend
cp .env.example .env          # then fill in real values
npm install
npm run migrate               # create tables
node src/db/seed.js you@example.com "Your Name"   # returns a userId
npm run dev                   # http://localhost:8080
```

## API

### `GET /api/payments/packages`
Returns the buyable token packages for the store UI.

### `POST /api/payments/create-bill`
```json
{ "userId": "<uuid>", "packageId": "starter" }
```
- Price/tokens are resolved **server-side** from `config/packages.js`
  (the client's price is never trusted).
- Creates a `Pending` transaction, calls Billplz with HTTP Basic Auth,
  stores the returned `billplz_bill_id`.
- Responds `{ "url": "https://.../bills/<id>", "transactionId": "<uuid>" }`.

### `POST /api/payments/webhook`  (Billplz `callback_url`)
- Verifies the **X-Signature** (HMAC-SHA256) before trusting the payload.
- On `paid === true`, credits tokens and marks the transaction `Success`.
- **Idempotent**: crediting only happens on a `Pending → Success` flip,
  guarded by `SELECT ... FOR UPDATE` inside a DB transaction, plus a
  `UNIQUE` constraint on `billplz_bill_id`. Duplicate webhooks are no-ops.

## Security notes
- Prices are integer **cents**, never floats.
- Billplz auth = HTTP Basic (`SECRET_KEY` as username, empty password).
- X-Signature verified in **constant time** (`crypto.timingSafeEqual`).
- All secrets come from environment variables — never commit `.env`.

## Deploy on Render
1. New **Web Service** → connect the GitHub repo, root dir `backend/`.
2. Build: `npm install` · Start: `npm start`.
3. Add a Render **PostgreSQL** instance; copy its Internal URL into
   `DATABASE_URL`. Run `npm run migrate` once (Render Shell).
4. Set all env vars from `.env.example`. Set `BACKEND_PUBLIC_URL` to the
   Render URL and `FRONTEND_URL` to the Vercel URL.
5. In Billplz, no dashboard webhook config is needed — the `callback_url`
   is sent per-bill and points at `/api/payments/webhook`.
