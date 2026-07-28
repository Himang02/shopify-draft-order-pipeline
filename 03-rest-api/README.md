# 03 — REST Admin API

Now we make the data model real. The Admin API is how *your server* talks to a Shopify store: creating products, looking up customers, and — the centerpiece of this repository — creating and completing **Draft Orders**.

This section is hands-on. Every endpoint is paired with runnable code in [`../examples/`](../examples/).

## Chapters

| # | Chapter | Status |
|---|---------|--------|
| 01 | [Authentication & the Admin API access token](01-authentication-and-access-tokens.md) | ✅ Written |
| 02 | [Products & Variants over REST](02-products-and-variants-over-rest.md) | ✅ Written |
| 03 | [Customers over REST](03-customers-over-rest.md) | ✅ Written |
| 04 | [Creating a Draft Order](04-creating-a-draft-order.md) | ✅ Written |
| 05 | [Invoice URLs](05-invoice-urls.md) | ✅ Written |
| 06 | [Completing a Draft Order → Order](06-completing-a-draft-order.md) | ✅ Written |

## Runnable examples

Each chapter is paired with code in [`../examples/`](../examples/): [`verify-auth.js`](../examples/verify-auth.js), [`products.js`](../examples/products.js), [`customers.js`](../examples/customers.js), [`create-draft-order.js`](../examples/create-draft-order.js), [`send-invoice.js`](../examples/send-invoice.js), [`complete-draft-order.js`](../examples/complete-draft-order.js). They share one `shopify()` helper pattern: read secrets from env, build the URL, send the token header, check `res.ok`.

## Architecture

```
+-------------+
| Your Server |
+-------------+
      │
      │ Admin API (HTTPS + access token)
      ▼
+-------------+
|   Shopify   |
+-------------+
```

## What's next

→ [04 — Webhooks](../04-webhooks/), where Shopify calls *your* server back.
