# 05 — GraphQL

Shopify is steadily moving its Admin API toward GraphQL. Anything you did over REST, you can do over GraphQL — but the shape is different, and the differences are worth understanding rather than memorizing.

This section assumes **no** prior GraphQL knowledge.

## Chapters

| # | Chapter | Status |
|---|---------|--------|
| 01 | [Why GraphQL? One endpoint, many shapes](01-why-graphql.md) | ✅ Written |
| 02 | [Queries vs Mutations](02-queries-vs-mutations.md) | ✅ Written |
| 03 | [Variables](03-variables.md) | ✅ Written |
| 04 | [Global IDs](04-global-ids.md) | ✅ Written |
| 05 | [Connections, edges, nodes, pagination](05-connections-edges-nodes-pagination.md) | ✅ Written |
| 06 | [userErrors](06-usererrors.md) | ✅ Written |
| 07 | [Fragments](07-fragments.md) | ✅ Written |

A GraphQL version of the draft-order create is in [`../examples/graphql-draft-order.js`](../examples/graphql-draft-order.js): one endpoint, a named mutation with variables, global IDs, and all three error channels checked.

## The key mental shift

```
REST:     many endpoints, each returns a fixed shape
              GET /products, GET /customers, GET /orders ...

GraphQL:  one endpoint, the query describes the shape you want
              POST /graphql   { ... }
```

## What's next

→ [06 — App Architecture](../06-app-architecture/).
