# Examples

Runnable Node.js / Express code referenced by the chapters. Every example here is minimal, includes its imports, and handles errors — it should run, not just illustrate.

## Conventions

- **Runtime:** Node.js with `async`/`await`.
- **Style:** JavaScript, Express for servers.
- **Secrets:** never hard-coded. Examples read from environment variables (e.g. `SHOPIFY_STORE`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`). Copy `.env.example` to `.env` when one is provided.
- **Store:** all examples target the imaginary **Himang's Tiramisu** store.

## Index

Examples are added alongside the chapters that introduce them.

| Example | Introduced in | Status |
|---------|---------------|--------|
| [`verify-auth.js`](verify-auth.js) | [03.01 Authentication](../03-rest-api/01-authentication-and-access-tokens.md) | ✅ |
| [`products.js`](products.js) | [03.02 Products & Variants](../03-rest-api/02-products-and-variants-over-rest.md) | ✅ |
| [`customers.js`](customers.js) | [03.03 Customers](../03-rest-api/03-customers-over-rest.md) | ✅ |
| [`create-draft-order.js`](create-draft-order.js) | [03.04 Creating a Draft Order](../03-rest-api/04-creating-a-draft-order.md) | ✅ |
| [`send-invoice.js`](send-invoice.js) | [03.05 Invoice URLs](../03-rest-api/05-invoice-urls.md) | ✅ |
| [`complete-draft-order.js`](complete-draft-order.js) | [03.06 Completing a Draft Order](../03-rest-api/06-completing-a-draft-order.md) | ✅ |
| [`webhook-server.js`](webhook-server.js) | [04 — Webhooks](../04-webhooks/) | ✅ |
| [`graphql-draft-order.js`](graphql-draft-order.js) | [05 — GraphQL](../05-graphql/) | ✅ |

## Running an example

All REST examples need Node.js 18+ and two environment variables:

```bash
export SHOPIFY_STORE="himangs-tiramisu.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxx"
node verify-auth.js
```

See [`.env.example`](.env.example) for the full list. The natural order mirrors the pipeline: `verify-auth` → `products` → `customers` → `create-draft-order` → `send-invoice` → `complete-draft-order`.

The REST examples use only Node's built-in `fetch` — no install needed. The webhook receiver ([`webhook-server.js`](webhook-server.js)) uses Express, so run `npm install` first, then `node webhook-server.js` (and expose it with `ngrok http 3000`). A [`package.json`](package.json) with npm-script shortcuts is included.

## What's next

Return to the [course home](../README.md).
