# Global IDs

Every GraphQL example used IDs like `gid://shopify/ProductVariant/9002`, where REST used a plain `9002`. That's GraphQL's identifier format, and it solves a real problem.

---

## Business Problem

In REST an ID was a bare number: `9002`. But `9002` *what*? A variant? A customer? The number alone doesn't say — you knew the type from the *URL* (`/variants/9002` vs `/customers/9002`). GraphQL has one endpoint and no per-type URL, so a bare `9002` is ambiguous.

> With one endpoint and no type-bearing URL, an identifier must carry its *own* type. A bare integer can't; a global ID can.

---

## Mental Model

> A **global ID** encodes both the **object type** and its **id** in one string: `gid://shopify/ProductVariant/9002`. Self-describing — you can tell what it points to by looking.

```
   gid://shopify/ProductVariant/9002
   └┬┘   └──┬──┘ └──────┬──────┘ └┬┘
   scheme  namespace    TYPE      numeric id
                     (the object kind)   (the REST id, embedded)
```

So a global ID is *"type + the REST integer,"* wrapped in a URI. Same object as REST's `9002`; the string just also says it's a `ProductVariant`.

Analogy: `9002` is a house number with no street; `gid://shopify/ProductVariant/9002` is the full address.

---

## Why GraphQL needs this

1. **Disambiguation at one endpoint.** `gid://shopify/Order/6001` and `gid://shopify/Customer/6001` are clearly different even though both embed `6001`.
2. **A universal `node` lookup.** One field, `node(id: …)`, fetches *any* object by its global ID — precisely because the ID carries the type:

```graphql
query {
  node(id: "gid://shopify/ProductVariant/9002") {
    ... on ProductVariant { id price sku }
  }
}
```

(`... on ProductVariant` is an *inline fragment* — [Chapter 07](07-fragments.md). Note the type-carrying ID is what makes a universal lookup possible.)

---

## Mapping REST IDs ⇄ global IDs

```
   REST integer            Global ID
   ───────────             ─────────
   9002 (a variant)   ⇄    gid://shopify/ProductVariant/9002
   7001 (a customer)  ⇄    gid://shopify/Customer/7001
   6001 (an order)    ⇄    gid://shopify/Order/6001
   5001 (a draft)     ⇄    gid://shopify/DraftOrder/5001
```

Wrap a REST id as `gid://shopify/<Type>/<id>`; reverse by taking the last segment:

```javascript
const gid = (type, id) => `gid://shopify/${type}/${id}`;
gid("ProductVariant", 9002);                        // "gid://shopify/ProductVariant/9002"

const numericId = (globalId) => globalId.split("/").pop();
numericId("gid://shopify/Customer/7001");            // "7001"
```

Two cautions:

- **Match the exact type name** — `ProductVariant` not `Variant`, `DraftOrder` not `Draft`. Wrong type → resolves to nothing.
- **Prefer treating global IDs as opaque strings.** The embedded integer works today, but passing whole IDs is safest unless you truly need the REST number.

---

## Production Considerations

- **Store one form consistently** — e.g. store the global ID, derive the integer when a REST call needs it.
- **Global IDs are the currency of GraphQL inputs** — `variantId`/`customerId` expect `gid://…`, not integers. Convert before sending.
- **Use `node(id:)` for polymorphic fetches** — an ID whose type varies.
- **Don't hand-build IDs from guesses** — wrap real REST IDs, or read global IDs from responses.
- **Treat as opaque where you can** — more robust than depending on the format.

---

## Common Misconceptions

**❌ "A global ID is totally different from the REST id."**
It *embeds* the REST integer plus the type. Same object, richer string.

**❌ "I can pass a bare integer to a mutation."**
Inputs expect global IDs. A plain `9002` fails.

**❌ "The type name is whatever I like."**
It must be the exact schema type. Wrong casing won't resolve.

**❌ "The number is meaningless."**
It's the same REST id, embedded — but prefer treating the whole string as opaque.

---

## Frequently Asked Questions

**Q: Why `gid://…` instead of a plain number?**
One endpoint, no type-bearing URL — the identifier must carry the type. `gid://…` says *what kind* and *which one*; a bare number says only "which one."

**Q: Convert both directions?**
Wrap as `gid://shopify/<Type>/<id>`; reverse by the trailing segment. Match the exact type name.

**Q: What's the `node` field?**
One query field that fetches any object by global ID — possible because the ID encodes the type.

**Q: Mutations want global IDs or integers?**
Global IDs. Convert your REST integers first.

**Q: Should I parse the integer out?**
You can (last segment), handy for REST calls, but prefer passing the whole ID; treat it as opaque.

---

## Interview Questions

1. What does a global ID encode that a REST integer doesn't, and why does GraphQL need it?
2. Decode `gid://shopify/DraftOrder/5001`.
3. Convert between REST id and global id, both ways.
4. What is `node(id:)`, and what property makes it work?
5. What happens if you pass a bare integer to a mutation?
6. Why treat global IDs as opaque?

---

## Summary

- A **global ID** encodes the **type** *and* the numeric id in one self-describing string.
- GraphQL needs it because **one endpoint has no type-bearing URL**; it also enables the universal **`node(id:)`** lookup.
- Convert by wrapping or taking the trailing segment; **match the exact type name**.
- **Inputs expect global IDs, not integers** — convert first — and treat them as **opaque strings**.

---

## What's Next

You've seen `edges`/`node` wrapping every list. That structure has a name and a purpose.

→ **Next: [Connections, edges, nodes, and pagination](05-connections-edges-nodes-pagination.md)** — why lists are wrapped this way, and how it powers cursor-based paging.
