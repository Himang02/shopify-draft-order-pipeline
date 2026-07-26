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
| `create-draft-order.js` | [03 — REST Admin API](../03-rest-api/) | 🚧 Planned |
| `webhook-server.js` | [04 — Webhooks](../04-webhooks/) | 🚧 Planned |
| `graphql-draft-order.js` | [05 — GraphQL](../05-graphql/) | 🚧 Planned |

## What's next

Return to the [course home](../README.md).
