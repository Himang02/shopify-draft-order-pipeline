# Mini Admin — Draft-Order Pipeline

A small, runnable admin UI that ties together everything from Sections 03–04: view products & variants, find-or-create customers, build draft orders, send invoices, **mark them paid** (complete → order), view orders, and receive **verified webhooks**.

It's a deliberately simple stand-in for a slice of the Shopify admin — the "intermediate step" between reading the chapters and building a real app.

## Architecture

The one rule this app demonstrates (Section 01's trust boundary): **the browser never sees the access token.**

```
  browser (public/*)  ──fetch /api/*──►  Express server  ──Admin API──►  Shopify
                                             │ holds shpat_ token
  Shopify  ──POST /webhooks/orders──────────►┘ (HMAC-verified)
```

The frontend (plain HTML/CSS/JS) calls our own `/api/*` routes. Those routes proxy to Shopify server-side using the secret token. The token stays in `app/.env`, on the server, always.

## Features

| Tab | What it does | Backed by |
|-----|--------------|-----------|
| Products | List products with variant IDs, prices, stock | `GET /products.json` |
| Customers | Search + **find-or-create** by email | `customers/search` + `POST /customers` |
| Create Draft Order | Pick variants × qty, attach a customer | `POST /draft_orders` |
| Draft Orders | List; **Send invoice**; **Mark paid** (complete) | `send_invoice`, `complete` |
| Orders | List with financial & fulfillment axes | `GET /orders.json` |
| Webhooks | Recent HMAC-verified `orders/*` webhooks | `POST /webhooks/orders` |

## Setup

1. **Install** (only dependency is Express):

   ```bash
   cd app
   npm install
   ```

2. **Configure** — copy the example env and fill in your custom app's token
   (Section 03, Ch. 01). Required scopes: `read_products`, `read_customers`,
   `write_customers`, `read_draft_orders`, `write_draft_orders`, `read_orders`.

   ```bash
   cp .env.example .env
   # edit .env: SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN, (optional) SHOPIFY_WEBHOOK_SECRET
   ```

3. **Run:**

   ```bash
   npm start
   # → Mini-admin running at http://localhost:3000
   ```

   Open http://localhost:3000. If the top-right badge shows the store name in
   green, your token works.

## Webhooks (optional)

To see the Webhooks tab populate:

1. Set `SHOPIFY_WEBHOOK_SECRET` in `.env` (the **webhook signing secret**, not
   the API secret — Section 04, Ch. 04).
2. Expose the server publicly (Section 04, Ch. 02):

   ```bash
   ngrok http 3000
   ```

3. Subscribe Shopify to `orders/create` (and/or `orders/paid`) pointing at
   `https://<your-ngrok>.ngrok.io/webhooks/orders`.
4. Complete a draft order → the webhook arrives, is HMAC-verified and deduped,
   and shows up in the tab.

## Notes & limitations

- **Learning tool, not production.** Idempotency uses an in-memory `Set`;
  the recent-webhooks log is in memory; there's no auth on the UI itself.
  A real app needs a database, background jobs, and access control.
- **No build step.** The frontend is vanilla HTML/CSS/JS served statically.
- **REST-based.** It uses the REST Admin API for clarity; the GraphQL twin of
  the create step lives in [`../examples/graphql-draft-order.js`](../examples/graphql-draft-order.js).
- `app/.env` and `app/node_modules/` are gitignored — secrets and deps never
  get committed.
