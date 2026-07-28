# Fragments

The last piece of GraphQL vocabulary, and a small one. As queries multiply, you find yourself listing the *same* fields over and over — every place you fetch a variant, you write `id price sku title`. **Fragments** let you name that field set once and reuse it. This closes Section 05.

---

## Business Problem

You have several queries that fetch variants: one for a product page, one for a draft order's line items, one for search results. Each repeats:

```graphql
id
price
sku
title
```

Copy-pasted field lists drift: you add `inventoryQuantity` in one place and forget the others, and now your queries disagree about what "a variant" looks like. You want a **single definition** of "the variant fields I care about," reused everywhere — the GraphQL version of extracting a shared function or constant.

---

## Mental Model

> A **fragment** is a named, reusable set of fields defined on a particular type. You define it once and **spread** it (`...FragmentName`) into any query or mutation that selects that type.

The two moves:

1. **Define** a fragment `on` a type, listing its fields.
2. **Spread** it with `...Name` wherever you'd otherwise repeat those fields.

It's straightforward DRY: define once, reuse many times, change in one place.

---

## Implementation

### Define and spread

Define a `VariantFields` fragment on the `ProductVariant` type, then spread it:

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
      edges {
        node {
          ...VariantFields      # spreads id, price, sku, title
        }
      }
    }
  }
}
```

- **`fragment VariantFields on ProductVariant { … }`** — the definition. `on ProductVariant` means it can only be spread where a `ProductVariant` is being selected (the schema enforces this).
- **`...VariantFields`** — the spread, expanding to exactly those four fields. Add a field to the fragment and *every* query using it gets it — no drift.

### Reuse across operations

The same fragment drops into a completely different query — say, a draft order's line-item variants — with no repetition:

```graphql
query DraftLineItems($id: ID!) {
  draftOrder(id: $id) {
    lineItems(first: 20) {
      edges {
        node {
          quantity
          variant { ...VariantFields }   # same fields, reused
        }
      }
    }
  }
}
```

One definition of "variant fields," used in two places. Change it once; both update.

### Inline fragments (a related form)

You met one already in [Chapter 04](04-global-ids.md): `... on ProductVariant { … }` inside a `node(id:)` lookup. That's an **inline fragment** — an *unnamed* fragment used to say "if this object is of type X, select these fields." It's the same fragment idea applied to **polymorphic** results (a field that could return several types), rather than for reuse:

```graphql
node(id: "gid://shopify/ProductVariant/9002") {
  ... on ProductVariant {   # inline: "when it's a ProductVariant, take these"
    ...VariantFields         # you can even spread a named fragment inside
  }
}
```

So there are two flavors: **named fragments** for reuse (define once, spread many), and **inline fragments** for type-conditional selection on polymorphic fields. Same underlying concept.

### Over HTTP

A named fragment definition travels in the **same query string** as the operation that uses it — you send both together:

```json
{
  "query": "fragment VariantFields on ProductVariant { id price sku title } query { product(id: \"gid://shopify/Product/8001\") { variants(first: 10) { edges { node { ...VariantFields } } } } }"
}
```

The fragment isn't stored server-side; it's part of the request, right alongside the operation.

---

## Production Considerations

- **Use fragments to keep field sets consistent.** Define "the fields I need for a variant / an order / a customer" once, and every query stays in sync automatically. This is the main payoff.
- **Fragments are typed — spread them only where the type matches.** `VariantFields on ProductVariant` can't be spread into a `Customer` selection. The schema rejects mismatches, catching errors early.
- **Great fit for client tooling.** In real apps (especially with GraphQL client libraries), co-locating a fragment with the component that needs the data is a common, powerful pattern. Even without a library, fragments reduce duplication.
- **Watch cost when composing.** Spreading a big fragment into a deeply paginated query multiplies the fields fetched, which raises query cost ([Section 10](../10-production/)). Reuse doesn't make fields free — keep fragments lean.
- **Inline fragments are for polymorphism.** Reach for `... on Type` when a field can return multiple types (like `node`) and you need type-specific fields. Reach for named fragments when you're repeating a field list.

---

## Common Misconceptions

**❌ "A fragment is stored on the server and referenced by name later."**
Reality: A named fragment is sent *with* the operation in the same request. It's a client-side reuse mechanism, not server-stored.

**❌ "I can spread a fragment anywhere."**
Reality: A fragment is defined `on` a type and can only be spread where that type is selected. The schema enforces it.

**❌ "Named and inline fragments are unrelated features."**
Reality: Same idea. Named fragments are for *reuse*; inline fragments (`... on Type`) are for *type-conditional* selection on polymorphic fields.

**❌ "Fragments make my query cheaper."**
Reality: They reduce *duplication in your source*, not the fields fetched. A spread expands to real fields that still count toward query cost.

---

## Frequently Asked Questions

**Q: What problem do fragments solve?**
Repetition. Instead of copy-pasting the same field list into many queries (and letting them drift), you define it once as a fragment and spread it. One place to change, consistent everywhere.

**Q: How do I define and use one?**
Define `fragment Name on Type { fields }`, then use `...Name` wherever a `Type` is selected. Send the definition together with the operation in the request.

**Q: What's the difference between a named fragment and an inline fragment?**
A **named** fragment (`fragment X on T`) is for reuse across operations. An **inline** fragment (`... on T { … }`) selects fields conditionally when a field can return multiple types (polymorphism), like `node(id:)`.

**Q: Do fragments reduce the data fetched or the cost?**
No — they reduce duplication in *your* query text. The spread expands to the same fields, which still count toward the response and the query cost.

**Q: Can I spread a fragment inside an inline fragment?**
Yes — e.g. `... on ProductVariant { ...VariantFields }`. They compose.

---

## Interview Questions

1. What is a fragment, and what problem does it solve?
2. How do you define a fragment and spread it into a query?
3. Why is a fragment tied to a specific type?
4. Distinguish named fragments from inline fragments and give a use case for each.
5. Is a fragment stored server-side? How does it reach Shopify?
6. Do fragments reduce query cost? Explain.

---

## Summary

- A **fragment** is a named, reusable set of fields defined **`on` a type**; you **spread** it with `...Name` to avoid repeating field lists and to keep them **consistent** (change once, update everywhere).
- Fragments are **typed** (spread only where the type matches) and travel **with the operation** in the request — not stored server-side.
- **Inline fragments** (`... on Type`) are the same idea for **polymorphic** selection (as in `node(id:)`), and the two compose.
- Fragments reduce **source duplication**, not fields fetched — so they don't lower **query cost**; keep them lean.

---

## What's Next

**That completes Section 05 — GraphQL.** You can now read with queries, change with mutations, pass values via variables, address objects with global IDs, page through connections, handle `userErrors`, and stay DRY with fragments. Every REST operation from Section 03 has a GraphQL twin — and the draft-order pipeline (`draftOrderCreate` → `draftOrderInvoiceSend` → `draftOrderComplete`) is fully expressible in both.

You've now covered Shopify's foundations, data model, both API surfaces, and webhooks. The remaining sections build outward toward production:

→ **Next: [Section 06 — App Architecture](../06-app-architecture/)**, then payments, checkout, authentication/OAuth, and production hardening. See the [course roadmap](../README.md) for the full path ahead.
