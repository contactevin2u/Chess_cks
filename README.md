# ♟️ Chess Game

A full-stack chess game with an in-app **Tokens** currency (purchased in MYR
via **Billplz**). Tokens are spendable only inside the game and cannot be
withdrawn or cashed out.

## Monorepo layout
```
chess/
├── backend/     # Node.js + Express API (deploy to Render)
│                #   wallet, tokens, Billplz payments + webhook
└── frontend/    # Next.js store + chess board (deploy to Vercel)  [coming next]
```

## Deployment
| Part      | Host    | Root directory | Notes                              |
|-----------|---------|----------------|------------------------------------|
| backend   | Render  | `backend/`     | + a Render PostgreSQL instance     |
| frontend  | Vercel  | `frontend/`    | env: `NEXT_PUBLIC_API_URL`         |

See `backend/README.md` for API details and env setup.
