# 05 — GraphQL

Shopify is steadily moving its Admin API toward GraphQL. Anything you did over REST, you can do over GraphQL — but the shape is different, and the differences are worth understanding rather than memorizing.

This section assumes **no** prior GraphQL knowledge.

## Chapters

| # | Chapter | Status |
|---|---------|--------|
| 01 | Why GraphQL? One endpoint, many shapes | 🚧 Planned |
| 02 | Queries vs Mutations | 🚧 Planned |
| 03 | Variables | 🚧 Planned |
| 04 | Global IDs | 🚧 Planned |
| 05 | Connections, edges, nodes, pagination | 🚧 Planned |
| 06 | userErrors | 🚧 Planned |
| 07 | Fragments | 🚧 Planned |

## The key mental shift

```
REST:     many endpoints, each returns a fixed shape
              GET /products, GET /customers, GET /orders ...

GraphQL:  one endpoint, the query describes the shape you want
              POST /graphql   { ... }
```

## What's next

→ [06 — App Architecture](../06-app-architecture/).
