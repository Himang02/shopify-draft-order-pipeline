# 03 — REST Admin API

Now we make the data model real. The Admin API is how *your server* talks to a Shopify store: creating products, looking up customers, and — the centerpiece of this repository — creating and completing **Draft Orders**.

This section is hands-on. Every endpoint is paired with runnable code in [`../examples/`](../examples/).

## Chapters

| # | Chapter | Status |
|---|---------|--------|
| 01 | Authentication & the Admin API access token | 🚧 Planned |
| 02 | Products & Variants over REST | 🚧 Planned |
| 03 | Customers over REST | 🚧 Planned |
| 04 | Creating a Draft Order | 🚧 Planned |
| 05 | Invoice URLs | 🚧 Planned |
| 06 | Completing a Draft Order → Order | 🚧 Planned |

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
