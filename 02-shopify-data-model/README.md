# 02 — Shopify Data Model

Shopify is, at its heart, a set of objects that relate to each other: products have variants, customers place orders, orders get fulfilled. If you understand these objects and how they connect, most of the API stops being surprising.

This is the most important section in the early course. The concepts here — especially **Product vs Variant** and **Draft Order vs Order** — are the ones beginners misunderstand most often.

## Chapters

| # | Chapter | Status |
|---|---------|--------|
| 01 | Products vs Variants | 🚧 Planned |
| 02 | Customers | 🚧 Planned |
| 03 | Draft Orders (the quotation) | 🚧 Planned |
| 04 | Orders and the order lifecycle | 🚧 Planned |
| 05 | Checkout, Invoice, Payment vs Fulfillment | 🚧 Planned |

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
