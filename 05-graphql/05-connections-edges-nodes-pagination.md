# Connections, Edges, Nodes, and Pagination

Every list came wrapped in `edges` and `node`: a product's `variants`, the `customers` result, an order's `lineItems`. It looks like pointless nesting, but it's GraphQL's **connection** pattern, built to make **pagination** work cleanly on large lists.

---

## Business Problem

Himang's store will have hundreds of orders — too many to fetch at once. You fetch in **pages**: "first 50," then "the next 50."

REST did this with the `Link` header and cursors — pagination bolted *around* the response. GraphQL builds it *into* the shape of every list, so paging works the same everywhere. That structure is the connection.

---

## Mental Model

> A **connection** is GraphQL's standard wrapper for a to-many relationship. It returns both the items *and* the paging metadata to fetch more.

```
   variants(first: 2) {              ← a CONNECTION (a paginated list)
     edges {                         ← the list of EDGES
       cursor                        ← this item's position marker
       node { id price }             ← the actual object (the variant)
     }
     pageInfo {                      ← paging metadata
       hasNextPage
       endCursor
     }
   }
```

- **Connection** — the whole paginated list.
- **Edge** — one entry: a **node** *plus* a **cursor**.
- **Node** — the actual object.
- **Cursor** — an opaque position marker; "give me what comes *after* this."
- **`pageInfo`** — `hasNextPage` (more?) and `endCursor` (where to continue).

Why the `edge` layer instead of a plain array? Because the **cursor** lives on the edge, separate from the object — that separation makes uniform, cursor-based paging possible.

Analogy: a connection is a book chapter; each **edge** is a page with a **page number (cursor)**; the **node** is the text; **`pageInfo`** is the "continued on p. 51" note.

---

## Pagination in practice

### Page 1

```graphql
query {
  product(id: "gid://shopify/Product/8001") {
    variants(first: 2) {
      edges { cursor node { id price } }
      pageInfo { hasNextPage endCursor }
    }
  }
}
```

```json
{ "data": { "product": { "variants": {
  "edges": [
    { "cursor": "eyJsYXN0X2lkIjo5MDAxfQ==", "node": { "id": "gid://shopify/ProductVariant/9001", "price": "300.00" } },
    { "cursor": "eyJsYXN0X2lkIjo5MDAyfQ==", "node": { "id": "gid://shopify/ProductVariant/9002", "price": "550.00" } }
  ],
  "pageInfo": { "hasNextPage": true, "endCursor": "eyJsYXN0X2lkIjo5MDAyfQ==" }
} } } }
```

Read `pageInfo`: **`hasNextPage: true`** and **`endCursor`** to continue from.

### Page 2

```graphql
query {
  product(id: "gid://shopify/Product/8001") {
    variants(first: 2, after: "eyJsYXN0X2lkIjo5MDAyfQ==") {
      edges { cursor node { id price } }
      pageInfo { hasNextPage endCursor }
    }
  }
}
```

Loop — fetch, read `pageInfo`, if `hasNextPage` fetch again `after: endCursor` — until it's `false`.

```
   fetch first:N ──► read pageInfo
        ▲                  │
        │            hasNextPage?
        └──── yes: after=endCursor ◄─┘
              no: done
```

### The arguments

- **`first: N`** / **`after: cursor`** — forward paging.
- **`last: N`** / **`before: cursor`** — backward.
- You must specify a page size; GraphQL won't dump an unbounded list.

---

## Production Considerations

- **Always paginate to-many fields** — read `pageInfo.hasNextPage` and loop on `endCursor`.
- **Cursors are opaque** — don't parse, guess, or fabricate them; pass back exactly what you got.
- **Mind query cost** — bigger `first:` and deeper nesting cost more ([Section 10](../10-production/)). Page in reasonable chunks.
- **Two meanings of `node`** — inside an edge it's the list item; the top-level **`node(id:)`** field ([Chapter 04](04-global-ids.md)) fetches any object by global ID. Don't conflate.
- **Shortcut:** some connections expose a `nodes` field (objects directly, no cursors) for small non-paginated reads.

---

## Common Misconceptions

**❌ "The `edges`/`node` wrapping is pointless."**
The edge carries the per-item **cursor**, kept separate from the object — what makes uniform paging work.

**❌ "One query returns the whole list."**
You specify a page size; large lists span pages. Loop with `pageInfo`/`endCursor`.

**❌ "A cursor is an index I can compute."**
Opaque tokens. Pass back what Shopify gave you.

**❌ "`node` always means the global-ID lookup."**
Inside an edge it's the list item's object; `node(id:)` is a different field.

---

## Frequently Asked Questions

**Q: Why wrap items in `edges`/`node`?**
So each item carries a **cursor** (on the edge) alongside the object (the node) — a uniform, cursor-based pagination mechanism.

**Q: How do I get the next page?**
Read `pageInfo.endCursor`/`hasNextPage`; if more, repeat with `after: <endCursor>`. Stop when `hasNextPage` is false.

**Q: What's a cursor?**
An opaque position marker; pass it in `after:`/`before:` to continue.

**Q: `first`/`after` vs `last`/`before`?**
Forward from the start vs. backward from the end. Always give a page size.

**Q: Skip the `edges` boilerplate?**
Some connections offer a `nodes` shortcut when you don't need cursors. For real pagination, use `edges` + `pageInfo`.

---

## Interview Questions

1. Define connection, edge, node, cursor.
2. Why the `edge` layer instead of a plain array?
3. Walk through paginating a large list.
4. `first`/`after` vs `last`/`before`?
5. Why treat cursors as opaque?
6. Distinguish the edge's `node` from `node(id:)`.

---

## Summary

- A **connection** is a paginated wrapper: **edges** (each a **node** + a **cursor**) and **`pageInfo`** (`hasNextPage`, `endCursor`).
- The **edge/cursor** layer enables uniform **cursor-based paging**.
- Page forward with **`first: N`** then **`after: endCursor`**, looping while **`hasNextPage`** is true.
- **Cursors are opaque**; **always paginate** to-many fields; watch **query cost**; don't confuse the edge's `node` with **`node(id:)`**.

---

## What's Next

We've flagged `userErrors` on every mutation without explaining it — the piece most likely to make a mutation "succeed" while nothing happens.

→ **Next: [userErrors](06-usererrors.md)** — why business failures come back inside the response, and how to handle them.
