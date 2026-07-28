# Why GraphQL? One Endpoint, Many Shapes

Everything in Sections 03–04 used REST — many endpoints, each returning a fixed JSON shape. Shopify's Admin API also speaks **GraphQL**, and it's the surface Shopify is investing in. This section teaches GraphQL from zero, assuming you know REST but nothing about GraphQL. We start with the *why*, because GraphQL's oddities all make sense once you see the problem it solves.

---

## Business Problem

Recall a REST call from [Section 03, Ch. 02](../03-rest-api/02-products-and-variants-over-rest.md): to get variant IDs, you did `GET /products.json` and received the **entire** product for each item — title, description, images, vendor, every field — then dug out the one thing you wanted (`variants[].id`). Two problems:

- **Over-fetching.** You downloaded a pile of fields to use one. Multiply across a catalog and it's a lot of wasted bytes.
- **Under-fetching (the N+1 problem).** Now suppose you want each order *with its customer's email and each line item's variant title.* In REST that's often: `GET /orders`, then for each order `GET /customers/{id}`, then more calls for details — many round trips to assemble one view.

REST gives you *fixed* shapes at *fixed* endpoints. Your needs rarely match those shapes exactly, so you either grab too much or make too many calls.

> The core tension: REST decides the response shape; you adapt. What if *you* could decide the shape instead?

---

## Mental Model

> **GraphQL is one endpoint where the request *describes the exact data you want*, and the response comes back in that same shape.** You ask for specific fields — and can follow relationships — in a single query. You get exactly those fields, no more, no less.

The shift in one line:

```
   REST:     many endpoints, each returns a FIXED shape → you adapt
   GraphQL:  ONE endpoint, YOUR query defines the shape  → it adapts
```

Analogy: REST is a set-menu restaurant — each dish (endpoint) comes exactly as the kitchen plates it. GraphQL is à la carte — you write the order and the kitchen returns precisely that plate. Same kitchen (the platform, [Section 01](../01-introduction/01-what-is-shopify.md)); different way of ordering.

This directly answers a question that puzzles REST developers:

> **Q: If GraphQL has only one endpoint, how does Shopify know what data I want?**
> **A: The query itself says so.** In REST, the *URL* encodes what you want (`/products` vs `/customers`). In GraphQL, the URL is always the same (`/graphql.json`) and the **body — the query — encodes what you want.** The information moved from the URL into the query.

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

Same authentication as REST — the `X-Shopify-Access-Token` header from [Section 03, Ch. 01](../03-rest-api/01-authentication-and-access-tokens.md). Only the request *shape* and endpoint change.

---

## A first query

Ask for just a product's title and its variants' IDs and prices — *nothing else*:

```graphql
query {
  product(id: "gid://shopify/Product/8001") {
    title
    variants(first: 10) {
      edges {
        node {
          id
          price
        }
      }
    }
  }
}
```

Sent as the body of a `POST` to the single GraphQL endpoint:

```
POST /admin/api/2024-10/graphql.json
X-Shopify-Access-Token: shpat_...
Content-Type: application/json

{ "query": "query { product(id: \"gid://shopify/Product/8001\") { title variants(first: 10) { edges { node { id price } } } } }" }
```

The response mirrors the query's shape *exactly* — the same nesting, only the fields you named:

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

No `body_html`, no `vendor`, no images — you didn't ask, so you didn't get. That's the whole idea. (The `gid://…` IDs, the `first:`, and the `edges`/`node` wrapping are all real GraphQL concepts we cover in later chapters — for now, notice only that *the response shape equals the request shape.*)

---

## What this section will cover

GraphQL introduces vocabulary that looks like ceremony until you know what each piece buys you. The roadmap:

| Chapter | Concept | The question it answers |
|---------|---------|--------------------------|
| 02 | Queries vs Mutations | How do I *read* vs *change* data? |
| 03 | Variables | How do I pass values in cleanly (not string-concatenate)? |
| 04 | Global IDs | Why `gid://shopify/Product/8001` instead of `8001`? |
| 05 | Connections, edges, nodes, pagination | Why all the `edges`/`node` wrapping? |
| 06 | userErrors | Why did my mutation "succeed" (200) but nothing changed? |
| 07 | Fragments | How do I avoid repeating the same field lists? |

By the end, the draft-order pipeline you built in REST will have a clear GraphQL equivalent.

---

## Production Considerations

- **GraphQL isn't automatically faster — it's more *precise*.** It shines when you'd otherwise over-fetch or make many REST round trips. For a single simple lookup, REST is just as fine.
- **Cost-based rate limiting.** REST limits *number* of calls; GraphQL limits *query cost* — a big nested query costs more than a small one. You budget "points," not requests. ([Section 10](../10-production/).)
- **One endpoint changes your tooling, not your auth.** Same token, same header; but you'll want a GraphQL client or at least a helper that `POST`s `{ query, variables }` and checks for errors.
- **Shopify is steering toward GraphQL.** Newer capabilities often land in GraphQL first, and some REST endpoints are being wound down over time. Knowing GraphQL is increasingly non-optional — hence this section.
- **Two error channels.** GraphQL has *transport/query* errors (a top-level `errors` array) and *business* errors (`userErrors`, Chapter 06). REST folded both into HTTP status codes; GraphQL splits them, and you must check both.

---

## Common Misconceptions

**❌ "GraphQL is a different Shopify product/API from REST."**
Reality: They're two *interfaces* to the same platform and data ([Section 01](../01-introduction/01-what-is-shopify.md)). Same store, same objects, same auth — different request shape.

**❌ "One endpoint means Shopify can't tell what I want."**
Reality: The *query* specifies what you want. The information that lived in the URL path (REST) now lives in the query body.

**❌ "GraphQL is always faster than REST."**
Reality: It's more *precise*, avoiding over/under-fetching. That often means fewer bytes and fewer round trips, but it's not magic — and it has its own cost-based limits.

**❌ "I need to learn a whole new authentication scheme."**
Reality: Auth is identical — the same access token in the same header. Only the endpoint and body differ.

---

## Frequently Asked Questions

**Q: If GraphQL has only one endpoint, how does Shopify know what data I want?**
The query does. You `POST` a query describing the fields and relationships you want; Shopify returns exactly that shape. In REST the URL said what you wanted; in GraphQL the query says it.

**Q: What are over-fetching and under-fetching?**
Over-fetching: getting more fields than you need (REST returning the whole object for one field). Under-fetching: one endpoint doesn't give enough, so you make many calls to assemble a view (the N+1 problem). GraphQL lets one query request exactly the right fields across relationships.

**Q: Should I abandon REST for GraphQL?**
No. Use whichever fits. GraphQL wins for precise or relationship-heavy reads and where Shopify only offers it; REST is perfectly fine for simple operations. They share auth and data, so mixing is fine.

**Q: Is GraphQL harder?**
It has more vocabulary up front (this section's job), but the payoff is asking for exactly what you need. Once the terms click, it's often *less* code than stitching REST calls together.

**Q: Same token as REST?**
Yes — the `shpat_` access token in `X-Shopify-Access-Token`. Auth doesn't change ([Section 03, Ch. 01](../03-rest-api/01-authentication-and-access-tokens.md)).

---

## Interview Questions

1. State the core difference between REST and GraphQL in terms of who decides the response shape.
2. Define over-fetching and under-fetching, with a REST example of each.
3. If GraphQL has a single endpoint, how does the server know what to return?
4. Is GraphQL a separate API from REST in Shopify? What do they share?
5. How does GraphQL's rate limiting differ from REST's?
6. Does moving to GraphQL change how you authenticate?

---

## Summary

- **REST returns fixed shapes at many endpoints**, causing **over-fetching** (too many fields) and **under-fetching** (too many round trips).
- **GraphQL is one endpoint where your query defines the response shape** — you request exactly the fields and relationships you want, and get precisely those back.
- The information that lived in the **URL** (REST) moves into the **query body** (GraphQL); that's how one endpoint knows what you want.
- It's the **same platform, data, and auth** as REST — only the request shape and endpoint change — with **cost-based** rate limits and **two error channels** to learn.
- The rest of the section unpacks the vocabulary (queries/mutations, variables, global IDs, connections, `userErrors`, fragments) and rebuilds the draft-order pipeline in GraphQL.

---

## What's Next

You've seen a read (a *query*). But the pipeline also *changes* data — creating draft orders, completing them. GraphQL separates those two intents explicitly.

→ **Next chapter: [Queries vs Mutations](02-queries-vs-mutations.md)** — reading with queries, changing with mutations, and why GraphQL insists on the distinction.
