# Queries vs Mutations

GraphQL splits everything you do into two verbs: **queries** (read) and **mutations** (change). In REST this distinction lived in the HTTP method — `GET` reads, `POST`/`PUT`/`DELETE` change. GraphQL makes it explicit in the request itself. This chapter shows both, using the objects you already know.

---

## Business Problem

Two kinds of things you did in REST:

- **Read** — "get me this product's variants," "find this customer" (`GET`).
- **Change** — "create a draft order," "complete it" (`POST`/`PUT`).

GraphQL uses **one endpoint and one HTTP method** (`POST`) for *both*. So how does Shopify know whether you intend to read or to write? You **say so**, with the keyword `query` or `mutation`.

---

## Mental Model

> A **query** *reads* data and has no side effects. A **mutation** *changes* data (create/update/delete) and returns the result of the change. Same endpoint, same auth — the opening keyword declares your intent.

Mapping from what you know:

```
   REST                         GraphQL
   GET    (read)          →      query
   POST/PUT/DELETE (write)→      mutation
```

Why bother distinguishing, when it's all `POST` under the hood? Because the intent matters:

- Queries are **safe and idempotent** — reading twice changes nothing, so they can be cached, parallelized, retried freely.
- Mutations **have side effects** — running `draftOrderCreate` twice makes two drafts (just like the REST `POST`, [Section 03, Ch. 04](../03-rest-api/04-creating-a-draft-order.md)). GraphQL also **runs multiple mutations in one request sequentially**, not in parallel, precisely because they change state.

Declaring `query` vs `mutation` lets the server (and you) treat them correctly.

---

## Queries: reading

A query names the field(s) you want to read and the shape to return. Find Alice by email (the GraphQL form of [Section 03, Ch. 03](../03-rest-api/03-customers-over-rest.md)):

```graphql
query {
  customers(first: 1, query: "email:alice@example.com") {
    edges {
      node {
        id
        firstName
        email
        numberOfOrders
      }
    }
  }
}
```

- **`query { ... }`** — intent: read.
- **`customers(first: 1, query: "…")`** — the field, with arguments. The `query:` argument reuses Shopify's search syntax from REST.
- You list **exactly the fields** you want (`id`, `firstName`, `email`, `numberOfOrders`) — the precision from [Chapter 01](01-why-graphql.md).

Response mirrors the shape:

```json
{ "data": { "customers": { "edges": [ { "node": {
  "id": "gid://shopify/Customer/7001", "firstName": "Alice",
  "email": "alice@example.com", "numberOfOrders": 4
} } ] } } }
```

---

## Mutations: changing

A mutation names an action, gives it input, and — crucially — asks for fields back describing the result. Create a draft order (the GraphQL form of [Section 03, Ch. 04](../03-rest-api/04-creating-a-draft-order.md)):

```graphql
mutation {
  draftOrderCreate(input: {
    lineItems: [{ variantId: "gid://shopify/ProductVariant/9002", quantity: 2 }]
    customerId: "gid://shopify/Customer/7001"
  }) {
    draftOrder {
      id
      status
      totalPrice
      invoiceUrl
    }
    userErrors {
      field
      message
    }
  }
}
```

Three parts, every mutation has them:

- **`mutation { actionName(input: { … }) { … } }`** — intent: change, plus the action (`draftOrderCreate`) and its `input`.
- **A return selection** — what you want back *about the result*: here the created `draftOrder`'s fields. You send inputs; Shopify computes totals and hands back the fields you asked for (same "send inputs, not totals" rule as REST).
- **`userErrors`** — business-rule failures (a bad variant ID, say) arrive here, *not* as an HTTP error. **Always request and check it** — that's Chapter 06's whole topic, flagged now because it's easy to forget and get a silent no-op.

The pipeline's other steps are mutations too: `draftOrderInvoiceSend`, `draftOrderComplete` — the GraphQL names for Section 03's `send_invoice` and `complete`.

---

## Architecture

```
   POST /graphql.json  (one endpoint, one method, same token)
        │
        ├── body starts with `query`     → read, no side effects, cacheable
        │        e.g. product { ... }, customers { ... }
        │
        └── body starts with `mutation`  → change, has side effects, returns result
                 e.g. draftOrderCreate { draftOrder { ... } userErrors { ... } }
```

---

## Production Considerations

- **Mutations aren't idempotent.** `draftOrderCreate` twice = two drafts, exactly like the REST `POST`. Add retry-safety/reconciliation ([Section 03, Ch. 04](../03-rest-api/04-creating-a-draft-order.md)).
- **Always select `userErrors` on mutations.** If you omit it, a business-rule failure looks like success (you get a `200` and a `null` object). Request it and branch on it every time (Chapter 06).
- **Ask only for fields you'll use.** The precision benefit ([Chapter 01](01-why-graphql.md)) and cost-based limits ([Section 10](../10-production/)) both reward small selections — especially on reads.
- **Multiple mutations in one request run in order.** If you send several mutations in a single document, they execute sequentially, top to bottom. Don't assume parallelism for writes.
- **Two error channels still apply.** Malformed queries / auth issues surface in a top-level `errors` array; business failures in `userErrors`. Check both.

---

## Common Misconceptions

**❌ "Queries and mutations use different endpoints/methods."**
Reality: Both are `POST` to the same `/graphql.json`. The `query`/`mutation` keyword declares intent.

**❌ "A mutation just needs the input; I don't need a return selection."**
Reality: You must select what to get back — including `userErrors`. Omitting the return block (or `userErrors`) leaves you blind to results and failures.

**❌ "Mutations are idempotent like queries."**
Reality: Queries are side-effect-free; mutations change state and repeating them repeats the effect.

**❌ "Multiple mutations in one document run in parallel."**
Reality: They run sequentially, because order matters for writes.

---

## Frequently Asked Questions

**Q: How does Shopify know if I'm reading or writing with one endpoint?**
The opening keyword. `query { … }` means read; `mutation { … }` means change. (If you omit the keyword, it defaults to a query.)

**Q: Why require a return selection on a mutation?**
So you can fetch the result of the change in the same round trip — the new object's fields *and* `userErrors` — instead of a follow-up read. It's efficient and explicit.

**Q: What maps to REST's GET/POST/PUT/DELETE?**
`GET` → `query`. `POST`/`PUT`/`DELETE` → `mutation`. The verb moved from the HTTP method into the GraphQL keyword and the action name (`draftOrderCreate`, `draftOrderComplete`, …).

**Q: Do queries and mutations use the same token?**
Yes — same `shpat_` access token, same header, as all of GraphQL ([Chapter 01](01-why-graphql.md)).

**Q: What's `userErrors` again?**
The array where a mutation reports business-rule failures (e.g. "variant not found") alongside a `200 OK`. Always request and check it; full treatment in [Chapter 06](06-usererrors.md).

---

## Interview Questions

1. What's the difference between a query and a mutation, and how is intent declared?
2. Map REST's HTTP verbs to GraphQL's two operation types.
3. Why must a mutation include a return selection, and what should it always include?
4. Are mutations idempotent? What's the practical consequence?
5. If you send several mutations in one document, how do they execute?
6. Which two error channels exist, and which reports "variant not found" on a create?

---

## Summary

- GraphQL has two operation types: **`query`** (read, side-effect-free, cacheable) and **`mutation`** (change, has side effects, returns the result) — both `POST` to the **same endpoint** with the **same token**.
- The **keyword declares intent**: `query` ≈ REST `GET`; `mutation` ≈ REST `POST`/`PUT`/`DELETE`.
- A **mutation** takes an `input` and requires a **return selection**, which must include **`userErrors`** — business failures appear there, not as HTTP errors.
- Mutations are **not idempotent**, and **multiple mutations in one document run sequentially**.
- The draft-order pipeline in GraphQL is `draftOrderCreate` → `draftOrderInvoiceSend` → `draftOrderComplete`, mirroring Section 03.

---

## What's Next

Both examples hard-coded values (an email, IDs) straight into the query string. That's brittle and unsafe. GraphQL has a proper mechanism for passing values in.

→ **Next chapter: [Variables](03-variables.md)** — parameterize queries and mutations cleanly, without string-concatenating user input.
