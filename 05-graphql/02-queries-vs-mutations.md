# Queries vs Mutations

GraphQL splits everything into two verbs: **queries** (read) and **mutations** (change). In REST this lived in the HTTP method (`GET` reads, `POST`/`PUT`/`DELETE` change); GraphQL makes it explicit in the request.

---

## Business Problem

Two kinds of REST operations:

- **Read** — get a product's variants, find a customer (`GET`).
- **Change** — create a draft order, complete it (`POST`/`PUT`).

GraphQL uses **one endpoint and one method** (`POST`) for both. So how does Shopify know your intent? You **say so**, with the keyword `query` or `mutation`.

---

## Mental Model

> A **query** *reads* (no side effects). A **mutation** *changes* (create/update/delete) and returns the result. Same endpoint, same auth — the opening keyword declares intent.

```
   REST                         GraphQL
   GET    (read)          →      query
   POST/PUT/DELETE (write)→      mutation
```

Why distinguish, if it's all `POST`? Because intent matters:

- Queries are **safe** — reading twice changes nothing; cacheable, parallelizable, freely retryable.
- Mutations **have side effects** — `draftOrderCreate` twice makes two drafts. Multiple mutations in one request run **sequentially**, not in parallel, because they change state.

---

## Queries: reading

A query names the fields you want. Find Alice by email (GraphQL form of [Section 03, Ch. 03](../03-rest-api/03-customers-over-rest.md)):

```graphql
query {
  customers(first: 1, query: "email:alice@example.com") {
    edges { node { id firstName email numberOfOrders } }
  }
}
```

- **`query { ... }`** — intent: read.
- **`customers(first: 1, query: "…")`** — the field with arguments; `query:` reuses Shopify's search syntax.
- You list **exactly the fields** you want.

Response mirrors the shape:

```json
{ "data": { "customers": { "edges": [ { "node": {
  "id": "gid://shopify/Customer/7001", "firstName": "Alice",
  "email": "alice@example.com", "numberOfOrders": 4
} } ] } } }
```

---

## Mutations: changing

A mutation names an action, gives it input, and asks for fields back describing the result. Create a draft order:

```graphql
mutation {
  draftOrderCreate(input: {
    lineItems: [{ variantId: "gid://shopify/ProductVariant/9002", quantity: 2 }]
    customerId: "gid://shopify/Customer/7001"
  }) {
    draftOrder { id status totalPrice invoiceUrl }
    userErrors { field message }
  }
}
```

Three parts, in every mutation:

- **`mutation { actionName(input: { … }) { … } }`** — intent + action (`draftOrderCreate`) + `input`.
- **A return selection** — what to get back about the result. You send inputs; Shopify computes totals and returns the fields you asked for.
- **`userErrors`** — business failures (a bad variant ID) arrive here, *not* as an HTTP error. **Always request and check it** (Chapter 06) or you get a silent no-op.

The pipeline's other steps are mutations too: `draftOrderInvoiceSend`, `draftOrderComplete`.

---

## Architecture

```
   POST /graphql.json  (one endpoint, one method, same token)
        │
        ├── body starts with `query`     → read, no side effects, cacheable
        └── body starts with `mutation`  → change, has side effects, returns result
                 e.g. draftOrderCreate { draftOrder { ... } userErrors { ... } }
```

---

## Production Considerations

- **Mutations aren't idempotent** — `draftOrderCreate` twice = two drafts. Add retry-safety.
- **Always select `userErrors`** — omit it and a business failure looks like success (`200` + a `null` object).
- **Ask only for fields you'll use** — precision and cost-based limits both reward small selections.
- **Multiple mutations in one document run in order** — don't assume parallelism for writes.
- **Two error channels** — top-level `errors` (malformed query/auth) and `userErrors` (business). Check both.

---

## Common Misconceptions

**❌ "Queries and mutations use different endpoints/methods."**
Both are `POST` to `/graphql.json`; the keyword declares intent.

**❌ "A mutation just needs the input."**
You must select what to get back, including `userErrors`.

**❌ "Mutations are idempotent like queries."**
Queries are side-effect-free; mutations repeat their effect.

**❌ "Multiple mutations run in parallel."**
Sequentially, because order matters for writes.

---

## Frequently Asked Questions

**Q: With one endpoint, how does Shopify know read vs write?**
The opening keyword: `query` (read) or `mutation` (change). Omitting it defaults to a query.

**Q: Why require a return selection on a mutation?**
So you fetch the result — the new object's fields *and* `userErrors` — in the same round trip.

**Q: REST verb mapping?**
`GET` → `query`; `POST`/`PUT`/`DELETE` → `mutation`. The verb moved into the keyword and action name.

**Q: Same token?**
Yes — `shpat_`, same header.

**Q: What's `userErrors`?**
Where a mutation reports business failures alongside a `200 OK`. Always check it (Chapter 06).

---

## Interview Questions

1. Query vs mutation, and how is intent declared?
2. Map REST verbs to the two operation types.
3. Why must a mutation include a return selection, and what should it always include?
4. Are mutations idempotent? The consequence?
5. How do multiple mutations in one document execute?
6. Which two error channels exist, and which reports "variant not found"?

---

## Summary

- Two operation types: **`query`** (read, cacheable) and **`mutation`** (change, returns the result) — both `POST` to the **same endpoint**, **same token**.
- The **keyword declares intent**: `query` ≈ `GET`; `mutation` ≈ `POST`/`PUT`/`DELETE`.
- A **mutation** takes an `input` and requires a **return selection** including **`userErrors`**.
- Mutations are **not idempotent**; multiple in one document run **sequentially**.
- The pipeline in GraphQL: `draftOrderCreate` → `draftOrderInvoiceSend` → `draftOrderComplete`.

---

## What's Next

Both examples hard-coded values into the query string — brittle and unsafe.

→ **Next: [Variables](03-variables.md)** — parameterize queries and mutations cleanly.
