# Products vs. Variants

The [previous chapter](01-the-shopify-data-model.md) mapped the objects. Now the first pair — the one beginners get wrong most often. Get it right and the catalog and the whole draft-order pipeline make sense. Get it wrong and your first order-creation call fails with a baffling error.

---

## Business Problem

Himang's Classic Tiramisu comes in two sizes:

- Small (250g) — ₹300
- Large (500g) — ₹550

Same name, description, and photos — but **different prices** and **separate stock** (maybe 40 Smalls, 12 Larges). So when Alice adds "Classic Tiramisu" to her cart, *which one is she buying?* The name alone is ambiguous — it has two prices, and you can't charge for something ambiguous.

> A shopper doesn't buy a *product*. They buy a specific *version* of it — a size, at a price, with its own stock.

Shopify needs one object for "the catalog page" and another for "the exact version in the cart." Those are the Product and the Variant.

---

## Mental Model

- A **Product** is the catalog concept — title, description, images, vendor. "Classic Tiramisu." **Not directly purchasable**, because on its own it may have no single price.
- A **Variant** is a specific, purchasable version — "Classic Tiramisu — Small." It has its own **price**, **stock**, and **SKU** (Stock Keeping Unit — the merchant's internal item code). **This is what a customer buys.**

> **Product is the class. Variant is the instance you can use.**

The relationship is one-to-many:

```
   Product: "Classic Tiramisu"
        │
        ├── Variant: Small  (250g)  ₹300   stock: 40
        └── Variant: Large  (500g)  ₹550   stock: 12
```

One product, two variants. Alice buys a **variant**.

---

## The rule that trips up everyone

> **Price, SKU, inventory, weight, and barcode live on the *Variant*, not the Product.**

A product has no price of its own. "What does Classic Tiramisu cost?" → "which size?" Price belongs to the variant, the sellable unit.

This is why every draft-order and order line item references a **variant ID**, never a product ID — the order needs the exact price and stock, which only the variant has. It's the root cause of the most common beginner bug ([Section 03](../03-rest-api/)).

---

## Does a product with no options still have a variant?

Yes. Say Matcha Tiramisu comes in one size only. You'd think "just a product, no variants." But Shopify **always** creates at least one variant — a **default variant** holding the price, SKU, and stock.

```
   Product: "Matcha Tiramisu"   (no visible options)
        │
        └── Variant: Default Title   ₹400   stock: 25
```

Why? Consistency. If the sellable unit were *sometimes* a product and *sometimes* a variant, every piece of code (carts, orders, inventory) would need two paths. Making the variant the sellable unit **always** keeps one rule: *you always buy a variant.* The default one often shows in the admin as "Default Title."

> **Every product has ≥ 1 variant. There is no directly-purchasable product.**

---

## Options: where variants come from

An **option** is a dimension of choice (Size, Flavor), each with **values** (Small, Large). A variant is one **combination** of option values.

One option:

```
   Option: Size = { Small, Large }
   → Variant: Small
   → Variant: Large
```

Two options → the combinations (a Cartesian product):

```
   Option 1: Size    = { Small, Large }
   Option 2: Flavor  = { Classic, Chocolate }

   Variants (2 × 2 = 4):
     Small / Classic,  Small / Chocolate,  Large / Classic,  Large / Chocolate
```

Two real constraints:

- A product can have up to **3 options** — a hard limit.
- Options multiply. 3 options × 5 values each = 125 variants, each with its own price and stock. Keep options lean.

(In this course, Classic/Chocolate/Matcha are **separate products** — different descriptions and photos. Whether something is an option value or a separate product is a modeling judgment; see Misconceptions.)

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │          PRODUCT             │
                    │  title:  Classic Tiramisu    │
                    │  description, images, vendor │
                    │  options: [ Size ]           │
                    └─────────────────────────────┘
                              │  has many
              ┌───────────────┴───────────────┐
              ▼                                ▼
   ┌────────────────────┐          ┌────────────────────┐
   │      VARIANT        │          │      VARIANT        │
   │  option: Small      │          │  option: Large      │
   │  price:  ₹300        │          │  price:  ₹550        │
   │  sku:    TIRA-CLS-S │          │  sku:    TIRA-CLS-L │
   │  inventory: 40      │          │  inventory: 12      │
   └────────────────────┘          └────────────────────┘
          ▲                                ▲
          │ this is what a cart / order line item points to │
          └──────────────── VARIANT ID ────────────────────┘
```

Catalog facts (title, images) live on the Product; sellable facts (price, stock) on the Variant. Every cart/draft/order line points at a **variant**.

---

## REST Implementation

Authentication is [Section 03](../03-rest-api/), so we're only reading the shape. Fetching Himang's Classic Tiramisu:

```
GET /admin/api/2024-10/products/{product_id}.json
```

```json
{
  "product": {
    "id": 8001,
    "title": "Classic Tiramisu",
    "body_html": "<p>Our signature coffee-soaked classic.</p>",
    "vendor": "Himang's Tiramisu",
    "options": [
      { "id": 101, "name": "Size", "values": ["Small", "Large"] }
    ],
    "variants": [
      { "id": 9001, "product_id": 8001, "option1": "Small", "price": "300.00", "sku": "TIRA-CLS-S", "inventory_quantity": 40 },
      { "id": 9002, "product_id": 8001, "option1": "Large", "price": "550.00", "sku": "TIRA-CLS-L", "inventory_quantity": 12 }
    ]
  }
}
```

The whole chapter is in this data:

- The **product** (`8001`) holds `title`, `body_html`, `vendor`, `options`.
- The **product has no `price` field** — price lives one level down.
- Each **variant** has its own `id`, `price`, `sku`, `inventory_quantity`, plus a `product_id` linking back.
- **Product ID `8001`; variant IDs `9001`/`9002`.** A draft order passes `9001`/`9002`. Passing `8001` is the classic mistake.

---

## GraphQL Implementation

Same data in GraphQL shape (full treatment in [Section 05](../05-graphql/)):

```graphql
query {
  product(id: "gid://shopify/Product/8001") {
    title
    options { name values }
    variants(first: 10) {
      edges { node { id title price sku inventoryQuantity } }
    }
  }
}
```

Two differences to just *notice*:

1. **Global IDs** — `gid://shopify/ProductVariant/9001` instead of the bare `9001`. Encodes the type + number. ([Section 05](../05-graphql/).)
2. **`edges`/`node` wrapping** — GraphQL calls a one-to-many a *connection*; the wrapping enables pagination. Also Section 05.

Same concept, different packaging.

---

## Production Considerations

- **Store and pass variant IDs for anything transactional** — carts, drafts, orders, inventory. Your "what did they buy" foreign key is the *variant* ID.
- **Don't assume a product price.** "From ₹300" is the *minimum variant price*, not a product price.
- **Watch variant explosion** — options multiply into hundreds of variants. Keep options minimal; model genuinely different items as separate products.
- **The default variant is real** — even single-option products have one ("Default Title"). Treat "exactly one variant" as normal.
- **SKUs are yours, IDs are Shopify's.** The `sku` can be blank or duplicated; key your logic off the guaranteed-unique variant `id`.

---

## Common Misconceptions

**❌ "A customer buys a product."**
They buy a *variant* — a specific version with a definite price and stock.

**❌ "A product has a price."**
Price lives on the variant. A product with ₹300 and ₹550 variants has no single price.

**❌ "No options means no variant."**
Every product has ≥ 1 variant — a default one holding price and stock.

**❌ "I can create an order with a product ID."**
Line items need a **variant** ID. Passing a product ID is the most common first-timer error.

**❌ "Different flavors must be options on one product."**
A modeling choice. Share nothing (photos, descriptions) → separate products. Interchangeable versions (sizes) → options on one product.

---

## Frequently Asked Questions

**Q: Why are Product IDs different from Variant IDs?**
They identify different objects: the product is the catalog entry; each variant is a distinct sellable unit with its own price and stock. They must be distinct so an order points at the exact thing sold.

**Q: Why doesn't a product just have a price field?**
Because it can have several prices (one per variant). Putting price on the product breaks the moment it has two sizes. Price lives where it's unambiguous — the variant.

**Q: What's a SKU, and do I need one?**
Stock Keeping Unit — the merchant's internal item code (e.g. `TIRA-CLS-S`). Optional, and not a good database key (can be blank/non-unique). Use the variant `id`.

**Q: My store shows one variant called "Default Title" — is that wrong?**
No. That's the default variant for a product with no options, holding your price and stock.

**Q: How many variants can a product have?**
Up to 3 options, with variants as the combinations of their values (a total limit applies). Keep options few.

---

## Interview Questions

1. In one sentence each, what is a Product and a Variant?
2. Where does price live, and why?
3. Does a product with no options have variants? Explain.
4. Which ID do line items use, and why does the other fail?
5. What's an option, and how do options relate to variants?
6. Give the Product-vs-Variant analogy.
7. Why is the variant `id` a better key than the `sku`?

---

## Summary

- A **Product** is the catalog concept; a **Variant** is a specific, purchasable version.
- **Customers buy variants, not products.**
- **Price, SKU, inventory, weight, barcode live on the Variant** — the product has no price.
- **Every product has ≥ 1 variant** (the default variant).
- **Options** define variants as combinations of their values. Max 3; they multiply fast.
- REST uses bare integer IDs; GraphQL uses **global IDs** and `edges`/`node`. Same concept, different packaging.
- The rule for the whole course: **transactional operations use the *variant* ID.**

---

## What's Next

→ **Next: Customers** — the second object, and the owned asset that makes a phone-order draft possible. Then the star of the repo: the **Draft Order**.
