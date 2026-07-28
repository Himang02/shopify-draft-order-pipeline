# Connections, Edges, Nodes, and Pagination

Every list in this section came wrapped in `edges` and `node`: a product's `variants`, the `customers` result, an order's `lineItems`. It looks like pointless nesting. It isn't — it's GraphQL's **connection** pattern, and it exists to make **pagination** work cleanly on large result sets. This chapter explains the wrapping and how to page through data with it.

---

## Business Problem

Himang's store will eventually have hundreds of orders. You can't fetch them all in one response — too big, too slow. So you need to fetch them in **pages**: "first 50," then "the next 50," and so on.

REST did this with the `Link` header and cursors ([Section 03, Ch. 02](../03-rest-api/02-products-and-variants-over-rest.md)) — pagination bolted on *around* the response. GraphQL builds pagination *into* the shape of every list, so paging works the same way everywhere. That built-in structure is the connection, and its `edges`/`node`/`pageInfo` parts are what enable it.

---

## Mental Model

> A **connection** is GraphQL's standard wrapper for a to-many relationship. It doesn't return a bare array; it returns a structure that carries both the items *and* the paging metadata needed to fetch more.

The parts:

```
   variants(first: 2) {              ← a CONNECTION (a paginated list)
     edges {                         ← the list of EDGES
       cursor                        ← this item's position marker
       node {                        ← the actual object (the variant)
         id
         price
       }
     }
     pageInfo {                      ← paging metadata
       hasNextPage
       endCursor
     }
   }
```

- **Connection** — the whole paginated list (`variants`, `orders`, `lineItems`).
- **Edge** — one entry in the list. It's a wrapper around a node *plus* a **cursor** (a position marker for that item).
- **Node** — the actual object you care about (the variant, the order).
- **Cursor** — an opaque string marking an item's position, used to say "give me what comes *after* this."
- **`pageInfo`** — metadata about the page: `hasNextPage` (is there more?) and `endCursor` (the cursor of the last item, to continue from).

Why the extra `edge` layer instead of a plain array? Because the edge is where **per-item paging info (the cursor)** lives, separate from the object itself. The node stays a clean object; the cursor rides alongside on the edge. That separation is what makes uniform, cursor-based pagination possible.

Analogy: a connection is a book chapter. Each **edge** is a page with a **page number (cursor)**; the **node** is the text on it; **`pageInfo`** is the "continued on p. 51" note telling you whether and where to go next.

---

## Pagination in practice

### Page 1

Ask for the first 2 variants, and request the paging metadata:

```graphql
query {
  product(id: "gid://shopify/Product/8001") {
    variants(first: 2) {
      edges {
        cursor
        node { id price }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}
```

Response:

```json
{ "data": { "product": { "variants": {
  "edges": [
    { "cursor": "eyJsYXN0X2lkIjo5MDAxfQ==", "node": { "id": "gid://shopify/ProductVariant/9001", "price": "300.00" } },
    { "cursor": "eyJsYXN0X2lkIjo5MDAyfQ==", "node": { "id": "gid://shopify/ProductVariant/9002", "price": "550.00" } }
  ],
  "pageInfo": { "hasNextPage": true, "endCursor": "eyJsYXN0X2lkIjo5MDAyfQ==" }
} } } }
```

Read `pageInfo`: **`hasNextPage: true`** (more exist) and **`endCursor`** (the marker to continue from).

### Page 2

Use `after: <endCursor>` to fetch the next page:

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

You loop — fetch, read `pageInfo`, and if `hasNextPage`, fetch again `after: endCursor` — until `hasNextPage` is `false`.

```
   fetch first:N ──► read pageInfo
        ▲                  │
        │            hasNextPage?
        └──── yes: after=endCursor ◄─┘
              no: done
```

### The pagination arguments

- **`first: N`** — take N items from the start (forward paging). **`after: cursor`** — start after a given cursor.
- **`last: N` / `before: cursor`** — the same idea backward.
- You must specify a page size (`first`/`last`); GraphQL won't dump an unbounded list.

---

## Production Considerations

- **Always paginate to-many fields.** Never assume one query returns every item. Read `pageInfo.hasNextPage` and loop on `endCursor` until done.
- **Cursors are opaque — don't parse or fabricate them.** Treat a cursor as a black-box token from Shopify. Don't build your own or assume it's an offset; pass back exactly what you received.
- **Mind query cost with page size and depth.** Bigger `first:` values and deeper nesting cost more under GraphQL's cost-based limits ([Section 10](../10-production/)). Page in reasonable chunks rather than one huge request.
- **`node` vs the `node` field are different words.** The `node` *inside an edge* is "the object in this list entry." The top-level **`node(id:)`** *field* from [Chapter 04](04-global-ids.md) is "fetch any object by global ID." Same word, two uses — don't conflate them.
- **Shopify sometimes offers a shortcut.** Some connections expose a convenience `nodes` field (the objects directly, skipping `edges`) when you don't need cursors. Handy for small, non-paginated reads; use the full `edges`/`pageInfo` form when you must page.

---

## Common Misconceptions

**❌ "The `edges`/`node` wrapping is pointless nesting."**
Reality: The edge layer carries the per-item **cursor** used for pagination, kept separate from the object (`node`). It's what makes uniform paging work.

**❌ "One query returns the whole list."**
Reality: You must specify a page size, and large lists span multiple pages. Loop using `pageInfo`/`endCursor`.

**❌ "A cursor is just an index I can compute."**
Reality: Cursors are opaque tokens. Don't parse, guess, or fabricate them — pass back what Shopify gave you.

**❌ "`node` always means the global-ID lookup field."**
Reality: Inside an edge, `node` is the list item's object. The top-level `node(id:)` field is a different thing (Chapter 04).

---

## Frequently Asked Questions

**Q: Why wrap list items in `edges`/`node` instead of a plain array?**
So each item can carry a **cursor** (on the edge) alongside the object (the node). That separation gives every list a uniform, cursor-based pagination mechanism.

**Q: How do I get the next page?**
Read `pageInfo.endCursor` and `pageInfo.hasNextPage`. If there's more, repeat the query with `after: <endCursor>`. Stop when `hasNextPage` is `false`.

**Q: What is a cursor, exactly?**
An opaque position marker for an item. You don't interpret it; you pass it back in `after:`/`before:` to continue from that spot.

**Q: What's the difference between `first`/`after` and `last`/`before`?**
`first`/`after` page forward from the start; `last`/`before` page backward from the end. You always give a page size.

**Q: Is there a way to skip the `edges` boilerplate?**
Some connections offer a `nodes` shortcut that returns the objects directly, for when you don't need cursors. For real pagination, use the full `edges` + `pageInfo` form.

---

## Interview Questions

1. Define connection, edge, node, and cursor.
2. Why does GraphQL add the `edge` layer instead of returning a plain array?
3. Walk through paginating a large list using `pageInfo` and `endCursor`.
4. What do `first`/`after` vs `last`/`before` do?
5. Why must cursors be treated as opaque?
6. Distinguish the `node` inside an edge from the top-level `node(id:)` field.

---

## Summary

- A **connection** is GraphQL's standard paginated wrapper for a to-many list, made of **edges** (each an object **node** plus a **cursor**) and **`pageInfo`** (`hasNextPage`, `endCursor`).
- The **edge/cursor** layer exists so pagination info rides alongside each item, enabling uniform **cursor-based paging**.
- Page forward with **`first: N`** then **`after: endCursor`**, looping while **`hasNextPage`** is true (or backward with `last`/`before`).
- **Cursors are opaque** — never parse or fabricate them; **always paginate** to-many fields; watch **query cost** with size/depth; and don't confuse the edge's `node` with the top-level **`node(id:)`** field.

---

## What's Next

We've flagged `userErrors` on every mutation without explaining it. It's the piece most likely to make a mutation "succeed" while nothing actually happens.

→ **Next chapter: [userErrors](06-usererrors.md)** — why GraphQL returns business-rule failures inside the response, and how to handle them so silent no-ops never bite you.
