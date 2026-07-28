# Global IDs

Every GraphQL example so far used IDs like `gid://shopify/ProductVariant/9002`, where REST used a plain `9002`. That's not decoration — it's GraphQL's identifier format, and it solves a real problem. This chapter explains what a global ID is, why GraphQL uses it, and how it maps to the REST integers you already have.

---

## Business Problem

In REST, an ID was a bare number: `9002`. But `9002` *what*? A variant? A customer? An order? The number alone doesn't say — you knew the type only from the *URL* you fetched it from (`/variants/9002` vs `/customers/9002`). In GraphQL there's just one endpoint and no per-type URL, so a bare `9002` would be ambiguous: the server couldn't tell which kind of object you mean.

> With one endpoint and no type-bearing URL, an identifier must carry its *own* type. A bare integer can't; a global ID can.

---

## Mental Model

> A **global ID** is a string that encodes both the **object type** and its **id** in one value: `gid://shopify/ProductVariant/9002`. It's globally unique and self-describing — you can tell what it points to just by looking.

Break the format down:

```
   gid://shopify/ProductVariant/9002
   └┬┘   └──┬──┘ └──────┬──────┘ └┬┘
   scheme  namespace    TYPE      numeric id
                     (the object kind)   (the REST id, embedded)
```

- **`gid://`** — a URI scheme ("global id"). Signals this is a global identifier.
- **`shopify`** — the namespace.
- **`ProductVariant`** — the **type**. This is the piece a bare integer lacked.
- **`9002`** — the same numeric id you saw in REST, embedded at the end.

So a global ID is essentially *"type + the REST integer,"* wrapped in a URI. Same underlying object as REST's `9002`; the string just also says it's a `ProductVariant`.

Analogy: REST's `9002` is a house number with no street. `gid://shopify/ProductVariant/9002` is the full address — the street name (type) plus the number — unambiguous on its own.

---

## Why GraphQL needs this

Two concrete payoffs:

1. **Disambiguation at one endpoint.** Because there's no type-specific URL, the ID itself must say what type it is. `gid://shopify/Order/6001` and `gid://shopify/Customer/6001` are clearly different objects even though both embed `6001`.
2. **A universal `node` lookup.** GraphQL offers a single field, `node(id: …)`, that can fetch *any* object by its global ID — precisely because the ID carries the type. One field, any object:

```graphql
query {
  node(id: "gid://shopify/ProductVariant/9002") {
    ... on ProductVariant { id price sku }
  }
}
```

(The `... on ProductVariant` is an *inline fragment* — "if this node is a ProductVariant, give me these fields." Fragments are [Chapter 07](07-fragments.md); for now just note the type-carrying ID is what makes a universal lookup possible.)

---

## Mapping between REST IDs and global IDs

You'll constantly move between the two, since earlier sections produced REST integers. The relationship is mechanical:

```
   REST integer            Global ID
   ───────────             ─────────
   9002 (a variant)   ⇄    gid://shopify/ProductVariant/9002
   7001 (a customer)  ⇄    gid://shopify/Customer/7001
   6001 (an order)    ⇄    gid://shopify/Order/6001
   5001 (a draft)     ⇄    gid://shopify/DraftOrder/5001
```

To go from a REST id to a global id, wrap it: `gid://shopify/<Type>/<id>`. To go the other way, take the last path segment. In code:

```javascript
// REST integer -> global ID
const gid = (type, id) => `gid://shopify/${type}/${id}`;
gid("ProductVariant", 9002); // "gid://shopify/ProductVariant/9002"

// Global ID -> REST integer (the trailing segment)
const numericId = (globalId) => globalId.split("/").pop();
numericId("gid://shopify/Customer/7001"); // "7001"
```

Two cautions:

- **Match the exact type name.** It's `ProductVariant`, not `Variant`; `DraftOrder`, not `Draft`. Wrong type → the ID resolves to nothing (or the wrong object).
- **Prefer treating global IDs as opaque strings.** The "embedded integer" is a helpful mental model and works today, but the safest habit is to pass whole global IDs around rather than parsing them apart unless you truly need the REST number.

---

## Production Considerations

- **Store whichever ID your APIs use, consistently.** If you mix REST and GraphQL, keep a clear convention (e.g. store the global ID, derive the integer when a REST call needs it) so you're never guessing which form a column holds.
- **Global IDs are the currency of GraphQL inputs.** Mutations like `draftOrderCreate` expect `variantId`/`customerId` as **global IDs**, not integers. Passing a bare `9002` fails validation. Convert before sending.
- **Use `node(id:)` for polymorphic fetches.** When you have an ID and want the object regardless of type, `node` is the tool — enabled entirely by the type being in the ID.
- **Don't hand-build IDs from guesses.** Wrap real REST IDs you obtained, or read global IDs straight from GraphQL responses. Fabricated IDs won't resolve.
- **Treat as opaque where you can.** Relying on parsing the format is fine pragmatically but couples you to it; passing the whole string is more robust.

---

## Common Misconceptions

**❌ "Global IDs are a totally different identifier from the REST id."**
Reality: A global ID *embeds* the REST integer, plus the type. Same object; richer string.

**❌ "I can pass a bare integer to a GraphQL mutation."**
Reality: GraphQL inputs expect global IDs (`gid://shopify/ProductVariant/9002`). A plain `9002` fails.

**❌ "The type name is whatever I like."**
Reality: It must be the exact schema type — `ProductVariant`, `DraftOrder`, `Customer`. Wrong casing/name won't resolve.

**❌ "The number in the middle/end is meaningless."**
Reality: It's the same numeric id REST uses, embedded at the end. But prefer treating the whole string as opaque rather than depending on that.

---

## Frequently Asked Questions

**Q: Why does GraphQL use `gid://…` instead of a plain number like REST?**
Because there's one endpoint and no type-bearing URL, so the identifier itself must carry the type. `gid://shopify/ProductVariant/9002` says both *what kind* and *which one*; a bare `9002` says only "which one," which is ambiguous.

**Q: How do I convert a REST id to a global id (and back)?**
Wrap it as `gid://shopify/<Type>/<id>`; to reverse, take the trailing segment. Match the exact type name.

**Q: What's the `node` field?**
A single query field that fetches any object by its global ID — possible only because the ID encodes the type. Use it for lookups where the ID is known but the type varies.

**Q: Do mutations want global IDs or integers?**
Global IDs. `variantId`, `customerId`, etc., are all `gid://…` strings. Convert your REST integers before sending.

**Q: Should I parse the integer out of a global ID?**
You can (last path segment), and it's handy when a REST call needs the number. But prefer passing the whole global ID around; treat it as opaque unless you specifically need the REST id.

---

## Interview Questions

1. What does a global ID encode that a REST integer doesn't, and why does GraphQL need it?
2. Decode `gid://shopify/DraftOrder/5001` into its parts.
3. How do you convert between a REST id and a global id in both directions?
4. What is the `node(id:)` field, and what property of global IDs makes it work?
5. What happens if you pass a bare integer to a mutation expecting a global ID?
6. Why is it safer to treat global IDs as opaque strings?

---

## Summary

- A **global ID** (`gid://shopify/ProductVariant/9002`) encodes the **object type** *and* the numeric id in one self-describing string — where REST used a bare, type-ambiguous integer.
- GraphQL needs it because **one endpoint has no type-bearing URL**, so the identifier must carry its own type; this also enables the universal **`node(id:)`** lookup.
- Convert by wrapping (`gid://shopify/<Type>/<id>`) or taking the trailing segment; **match the exact type name** (`ProductVariant`, `DraftOrder`, …).
- GraphQL **inputs expect global IDs, not integers** — convert your REST ids before sending — and it's safest to treat global IDs as **opaque strings**.

---

## What's Next

You've now seen `edges` and `node` wrapping every list — variants, customers, line items. That structure has a name and a purpose.

→ **Next chapter: [Connections, edges, nodes, and pagination](05-connections-edges-nodes-pagination.md)** — why GraphQL wraps lists this way, and how it powers cursor-based paging through large result sets.
