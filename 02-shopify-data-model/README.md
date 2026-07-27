# 02 — Shopify Data Model

Shopify is, at its heart, a set of objects that relate to each other: products have variants, customers place orders, orders get fulfilled. If you understand these objects and how they connect, most of the API stops being surprising.

So this section starts with a **map of the whole data model**, then zooms into each object. The concepts here — especially **Product vs Variant** and **Draft Order vs Order** — are the ones beginners misunderstand most often.

## Chapters

| # | Chapter | Status |
|---|---------|--------|
| 01 | [The Shopify Data Model (overview of all objects)](01-the-shopify-data-model.md) | ✅ Written |
| 02 | [Products vs Variants](02-products-vs-variants.md) | ✅ Written |
| 03 | Customers | 🚧 Planned |
| 04 | Draft Orders (the quotation) | 🚧 Planned |
| 05 | Orders and the order lifecycle | 🚧 Planned |
| 06 | Checkout, Invoice, Payment vs Fulfillment | 🚧 Planned |

## The one diagram to remember

```
Customer
    │
    ▼
Draft Order   (a quotation — not yet a sale)
    │
    ▼
Invoice URL
    │
    ▼
Checkout
    │
    ▼
Payment
    │
    ▼
Order         (a real, committed sale)
    │
    ▼
Fulfillment   (getting the goods to the customer)
```

## What's next

→ [03 — REST Admin API](../03-rest-api/), where we finally make these objects real over HTTP.
