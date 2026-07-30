# Why GraphQL? One Endpoint, Many Shapes

Sections 03–04 used REST — many endpoints, each returning a fixed shape. Shopify's Admin API also speaks **GraphQL**, the surface Shopify is investing in. This section teaches it from zero, assuming REST but no GraphQL. Start with the *why* — the oddities make sense once you see the problem it solves.

---

## Business Problem

To get variant IDs in REST ([Section 03, Ch. 02](../03-rest-api/02-products-and-variants-over-rest.md)), you `GET /products.json` and receive the **entire** product per item, then dig out `variants[].id`. Two problems:

- **Over-fetching** — you download a pile of fields to use one.
- **Under-fetching (N+1)** — want each order *with its customer's email and each variant's title*? In REST that's `GET /orders`, then a `GET /customers/{id}` per order, then more — many round trips for one view.

REST gives *fixed* shapes at *fixed* endpoints; your needs rarely match, so you over-fetch or make too many calls.

> REST decides the response shape; you adapt. What if *you* decided the shape?

---

## Mental Model

> **GraphQL is one endpoint where the request *describes the exact data you want*, and the response comes back in that shape.** Ask for specific fields, follow relationships, in one query — get exactly those fields, no more.

```
   REST:     many endpoints, each returns a FIXED shape → you adapt
   GraphQL:  ONE endpoint, YOUR query defines the shape  → it adapts
```

Analogy: REST is a set menu (each dish as the kitchen plates it); GraphQL is à la carte (you write the order, the kitchen returns exactly that). Same kitchen (the platform), different way of ordering.

This answers a puzzling question:

> **Q: With one endpoint, how does Shopify know what data I want?**
> **A: The query says so.** In REST the *URL* encodes it (`/products` vs `/customers`); in GraphQL the URL is always `/graphql.json` and the **query body** encodes it. The info moved from URL to query.

---

## Architecture

```
   REST                                   GraphQL

   GET /products.json    ─► products      POST /graphql.json
   GET /customers/1.json ─► one customer      body: { query: "{ ... exactly what I want ... }" }
   GET /orders.json      ─► orders             │
        (fixed shapes, many URLs)              ▼
                                          one endpoint returns the shape you asked for
```

Same authentication as REST — the `X-Shopify-Access-Token` header. Only the request shape and endpoint change.

---

## A first query

Ask for just a product's title and its variants' IDs and prices:

```graphql
query {
  product(id: "gid://shopify/Product/8001") {
    title
    variants(first: 10) {
      edges { node { id price } }
    }
  }
}
```

As the body of a `POST`:

```
POST /admin/api/2024-10/graphql.json
X-Shopify-Access-Token: shpat_...
Content-Type: application/json

{ "query": "query { product(id: \"gid://shopify/Product/8001\") { title variants(first: 10) { edges { node { id price } } } } }" }
```

The response mirrors the query's shape exactly — only the fields you named:

```json
{
  "data": {
    "product": {
      "title": "Classic Tiramisu",
      "variants": {
        "edges": [
          { "node": { "id": "gid://shopify/ProductVariant/9001", "price": "300.00" } },
          { "node": { "id": "gid://shopify/ProductVariant/9002", "price": "550.00" } }
        ]
      }
    }
  }
}
```

No `body_html`, no `vendor`, no images — you didn't ask, so you didn't get. (The `gid://…` IDs, `first:`, and `edges`/`node` are covered in later chapters; for now, notice *the response shape equals the request shape*.)

---

## What this section covers

| Chapter | Concept | The question |
|---------|---------|--------------------------|
| 02 | Queries vs Mutations | Read vs change data? |
| 03 | Variables | Pass values cleanly (not string-concat)? |
| 04 | Global IDs | Why `gid://shopify/Product/8001` not `8001`? |
| 05 | Connections, edges, nodes, pagination | Why the `edges`/`node` wrapping? |
| 06 | userErrors | Why did my mutation "succeed" (200) but nothing changed? |
| 07 | Fragments | Avoid repeating field lists? |

By the end, the draft-order pipeline has a clear GraphQL equivalent.

---

## Production Considerations

- **Not automatically faster — more *precise*.** It shines against over-fetching / many round trips. For a single simple lookup, REST is just as fine.
- **Cost-based rate limiting** — REST limits *call count*; GraphQL limits *query cost*. You budget points, not requests ([Section 10](../10-production/)).
- **One endpoint changes tooling, not auth** — same token, but you'll want a helper that `POST`s `{ query, variables }` and checks errors.
- **Shopify is steering toward GraphQL** — new capabilities land there first; some REST endpoints are winding down.
- **Two error channels** — top-level `errors` (transport/query) and `userErrors` (business, Chapter 06). Check both.

---

## Common Misconceptions

**❌ "GraphQL is a different Shopify API from REST."**
Two interfaces to the same platform and data — same store, objects, auth; different request shape.

**❌ "One endpoint means Shopify can't tell what I want."**
The *query* specifies it — what lived in the URL now lives in the query body.

**❌ "GraphQL is always faster."**
More *precise*, not magic; it has its own cost-based limits.

**❌ "I need a new auth scheme."**
Identical — same token, same header. Only endpoint and body differ.

---

## Frequently Asked Questions

**Q: With one endpoint, how does Shopify know what I want?**
The query does. You `POST` a query describing the fields and relationships; Shopify returns exactly that.

**Q: Over-fetching vs under-fetching?**
Over: more fields than you need. Under: one endpoint isn't enough, so many calls assemble a view (N+1). GraphQL requests exactly the right fields across relationships.

**Q: Abandon REST for GraphQL?**
No — use whichever fits. GraphQL for precise/relationship-heavy reads and where only it's offered; REST for simple ops. They share auth and data.

**Q: Is GraphQL harder?**
More vocabulary up front, but the payoff is asking for exactly what you need — often *less* code than stitching REST calls.

**Q: Same token as REST?**
Yes — `shpat_` in `X-Shopify-Access-Token`.

---

## Interview Questions

1. Core REST vs GraphQL difference — who decides the response shape?
2. Define over- and under-fetching, with a REST example of each.
3. With a single endpoint, how does the server know what to return?
4. Is GraphQL a separate API? What do they share?
5. How does GraphQL rate limiting differ from REST's?
6. Does GraphQL change how you authenticate?

---

## Summary

- **REST returns fixed shapes at many endpoints**, causing **over-fetching** and **under-fetching**.
- **GraphQL is one endpoint where your query defines the response shape** — request exactly the fields and relationships you want.
- What lived in the **URL** moves into the **query body**.
- **Same platform, data, and auth** as REST; different request shape, plus **cost-based** limits and **two error channels**.
- The rest of the section unpacks the vocabulary and rebuilds the pipeline in GraphQL.

---

## What's Next

You've seen a read (a *query*). The pipeline also *changes* data. GraphQL separates those intents explicitly.

→ **Next: [Queries vs Mutations](02-queries-vs-mutations.md)** — reading with queries, changing with mutations, and why GraphQL insists on the distinction.
