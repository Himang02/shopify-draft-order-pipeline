# Fragments

The last piece of GraphQL vocabulary, and a small one. As queries multiply, you list the *same* fields over and over — every variant fetch is `id price sku title`. **Fragments** name that set once and reuse it.

---

## Business Problem

Several queries fetch variants — a product page, a draft's line items, search results — each repeating:

```graphql
id
price
sku
title
```

Copy-pasted lists drift: you add `inventoryQuantity` in one place, forget the others, and your queries disagree about what "a variant" is. You want a **single definition**, reused everywhere — like extracting a shared function.

---

## Mental Model

> A **fragment** is a named, reusable set of fields defined on a type. Define it once, **spread** it (`...Name`) into any query or mutation that selects that type.

Two moves: **define** `on` a type, then **spread** with `...Name`. Straightforward DRY — change in one place.

---

## Implementation

### Define and spread

```graphql
fragment VariantFields on ProductVariant {
  id
  price
  sku
  title
}

query {
  product(id: "gid://shopify/Product/8001") {
    title
    variants(first: 10) {
      edges { node { ...VariantFields } }   # spreads id, price, sku, title
    }
  }
}
```

- **`fragment VariantFields on ProductVariant { … }`** — `on ProductVariant` means it can only be spread where a `ProductVariant` is selected (schema-enforced).
- **`...VariantFields`** — expands to those four fields. Add one to the fragment and *every* query using it gets it.

### Reuse across operations

The same fragment drops into a different query:

```graphql
query DraftLineItems($id: ID!) {
  draftOrder(id: $id) {
    lineItems(first: 20) {
      edges { node { quantity variant { ...VariantFields } } }   # same fields, reused
    }
  }
}
```

One definition, two places. Change it once; both update.

### Inline fragments (a related form)

You met one in [Chapter 04](04-global-ids.md): `... on ProductVariant { … }` in a `node(id:)` lookup. That's an **inline fragment** — an *unnamed* one saying "if this object is type X, select these fields." Same idea, applied to **polymorphic** results rather than reuse:

```graphql
node(id: "gid://shopify/ProductVariant/9002") {
  ... on ProductVariant {   # inline: "when it's a ProductVariant, take these"
    ...VariantFields         # you can spread a named fragment inside
  }
}
```

So two flavors: **named fragments** for reuse, **inline fragments** for type-conditional selection. Same underlying concept.

### Over HTTP

A named fragment travels in the **same query string** as the operation:

```json
{
  "query": "fragment VariantFields on ProductVariant { id price sku title } query { product(id: \"gid://shopify/Product/8001\") { variants(first: 10) { edges { node { ...VariantFields } } } } }"
}
```

It isn't stored server-side; it's part of the request.

---

## Production Considerations

- **Use fragments to keep field sets consistent** — define "the fields for a variant" once; every query stays in sync. The main payoff.
- **Fragments are typed** — spread only where the type matches; the schema rejects mismatches early.
- **Great with client tooling** — co-locating a fragment with the component that needs the data is a common pattern.
- **Watch cost when composing** — a spread expands to real fields that count toward query cost. Keep fragments lean.
- **Inline fragments are for polymorphism** (`... on Type` on fields like `node`); named fragments are for repeated field lists.

---

## Common Misconceptions

**❌ "A fragment is stored on the server."**
It's sent *with* the operation — a client-side reuse mechanism.

**❌ "I can spread a fragment anywhere."**
Only where its type is selected. The schema enforces it.

**❌ "Named and inline fragments are unrelated."**
Same idea — reuse vs. type-conditional selection.

**❌ "Fragments make my query cheaper."**
They reduce *source* duplication, not fields fetched. The spread still counts toward cost.

---

## Frequently Asked Questions

**Q: What do fragments solve?**
Repetition and drift. Define the field list once, spread it, change in one place.

**Q: How do I define and use one?**
`fragment Name on Type { fields }`, then `...Name` where a `Type` is selected. Send the definition with the operation.

**Q: Named vs inline fragment?**
Named (`fragment X on T`) is for reuse; inline (`... on T { … }`) selects conditionally on polymorphic fields like `node(id:)`.

**Q: Do fragments reduce data or cost?**
No — only source duplication. The spread expands to the same fields.

**Q: Spread a fragment inside an inline fragment?**
Yes — `... on ProductVariant { ...VariantFields }`. They compose.

---

## Interview Questions

1. What is a fragment, and what does it solve?
2. How do you define and spread one?
3. Why is a fragment tied to a type?
4. Named vs inline fragments — a use case for each.
5. Is a fragment stored server-side? How does it reach Shopify?
6. Do fragments reduce query cost? Explain.

---

## Summary

- A **fragment** is a named, reusable field set defined **`on` a type**; **spread** it with `...Name` to avoid repetition and keep field lists **consistent**.
- Fragments are **typed** and travel **with the operation** — not server-stored.
- **Inline fragments** (`... on Type`) apply the same idea to **polymorphic** selection; the two compose.
- Fragments cut **source duplication**, not fields fetched — so not **query cost**. Keep them lean.

---

## What's Next

**That completes Section 05 — GraphQL.** You can read with queries, change with mutations, pass variables, use global IDs, page through connections, handle `userErrors`, and stay DRY with fragments. Every REST operation has a GraphQL twin, and the pipeline (`draftOrderCreate` → `draftOrderInvoiceSend` → `draftOrderComplete`) works in both.

→ **Next: [Section 06 — App Architecture](../06-app-architecture/)**, then payments, checkout, auth/OAuth, and production. See the [course roadmap](../README.md).
