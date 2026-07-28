# 04 — Webhooks

So far, your server calls Shopify. Webhooks flip the direction: Shopify calls *your* server when something happens — an order is paid, a product is updated, a customer is created.

This section covers the full webhook pipeline, including the security details that trip up almost everyone the first time: raw request bodies, HMAC signatures, and constant-time comparison.

## Chapters

| # | Chapter | Status |
|---|---------|--------|
| 01 | [What are webhooks, and why?](01-what-are-webhooks.md) | ✅ Written |
| 02 | [Local development with ngrok](02-local-development-with-ngrok.md) | ✅ Written |
| 03 | [`express.raw()` vs `express.json()`](03-express-raw-vs-json.md) | ✅ Written |
| 04 | [HMAC, SHA-256, and `timingSafeEqual`](04-hmac-sha256-timingsafeequal.md) | ✅ Written |
| 05 | [Replay attacks and webhook security](05-replay-attacks-and-security.md) | ✅ Written |

A complete, correct receiver is in [`../examples/webhook-server.js`](../examples/webhook-server.js): raw body → verify HMAC → freshness → parse → dedupe → ack.

## Architecture

```
+-------------+
|   Shopify   |
+-------------+
      │
      │ Webhook (HTTPS POST + HMAC header)
      ▼
+-------------+
| Your Server |  ← must verify the signature before trusting the body
+-------------+
```

## What's next

→ [05 — GraphQL](../05-graphql/), Shopify's other (and increasingly preferred) API surface.
