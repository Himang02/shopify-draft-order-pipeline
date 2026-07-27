# Products vs. Variants

The [previous chapter](01-the-shopify-data-model.md) mapped all of Shopify's core objects. Now we zoom into the first pair — and it's the pair beginners get wrong most often. If you internalize the difference between a **Product** and a **Variant**, the catalog half of the data model, and the entire draft-order pipeline this repository is built around, stops being confusing. Get it wrong, and your very first attempt to create an order will fail with a baffling error.

So we'll go slow.

---

## Business Problem

Himang sells Classic Tiramisu. But "Classic Tiramisu" isn't one sellable thing — it comes in two sizes:

- Small (250g) — ₹300
- Large (500g) — ₹550

They share a name, a description, and the same photos. But they have **different prices**, and Himang tracks their **stock separately** (there might be 40 Smalls left and only 12 Larges).

Now the question Shopify has to answer: when Alice adds "Classic Tiramisu" to her cart, *which one is she buying?* "Classic Tiramisu" alone is ambiguous — it has two prices. You can't charge a customer for an ambiguous thing.

This is the problem Products and Variants solve:

> A shopper doesn't buy a *product*. They buy a specific *version* of a product — a particular size, at a particular price, with its own stock.

Shopify needs one object for "the thing on the catalog page" and another for "the exact version you put in your cart." Those are the Product and the Variant.

---

## Mental Model

Keep this pair in your head for the rest of the course:

- A **Product** is the *marketing concept* — the item as it appears on a catalog page. "Classic Tiramisu." It has a title, a description, images, a vendor. **It is not directly purchasable**, because on its own it may not have a single price.
- A **Variant** is a *specific, purchasable version* of that product. "Classic Tiramisu — Small." It has its own **price**, its own **stock**, its own **SKU** (Stock Keeping Unit — the merchant's internal code for an item). **This is the thing a customer actually buys.**

An analogy backend engineers find natural:

> **Product is the class. Variant is the instance you can actually use.**


The relationship is strictly one-to-many:

```
   Product: "Classic Tiramisu"
        │
        ├── Variant: Small  (250g)  ₹300   stock: 40
        └── Variant: Large  (500g)  ₹550   stock: 12
```

One product, two variants. Alice buys a **variant**.

---

## The rule that trips up everyone

Here is the single most valuable sentence in this chapter:

> **Price, SKU, inventory, weight, and barcode live on the *Variant*, not the Product.**

A Product has no price of its own. Ask "what does Classic Tiramisu cost?" and the honest answer is "which size?" The price belongs to the variant, because the variant is the sellable unit.

This is *why*, later, when you create a draft order or an order, every line item references a **variant ID** — never a product ID. The order needs to know the exact price and stock to reserve, and only the variant has those. We'll hit this head-on in [Section 03](../03-rest-api/); it's flagged here because it's the root cause of the most common beginner bug.

---

## "But my product has no options — does it still have a variant?"

Yes. This surprises people, so it's worth stating clearly.

Suppose Himang sells Matcha Tiramisu in **one** size only — no choices to make. You'd think it's "just a product, no variants." But Shopify **always** creates at least one variant per product: a single **default variant** that silently holds the price, SKU, and stock.

```
   Product: "Matcha Tiramisu"   (no visible options)
        │
        └── Variant: Default Title   ₹400   stock: 25
```

Why does Shopify do this? Consistency. If the sellable unit were *sometimes* the product and *sometimes* the variant, every piece of code (carts, orders, inventory) would need two code paths. By making the variant the sellable unit **always** — even when there's only one — Shopify keeps one rule: *you always buy a variant.* The default variant just often shows up in the admin with the title "Default Title."

> **Takeaway:** every product has **≥ 1** variant. There is no such thing as a product you can buy directly.

---

## Options: where variants come from

If a product can have many variants, what *defines* them? **Options.**

An **option** is a dimension of choice — like "Size" or "Flavor" — and each option has **values** ("Small", "Large"). A variant is one specific **combination** of option values.

With a single option it's simple:

```
   Option: Size = { Small, Large }

   → Variant: Small
   → Variant: Large
```

With two options, variants are the **combinations** (a Cartesian product):

```
   Option 1: Size    = { Small, Large }
   Option 2: Flavor  = { Classic, Chocolate }

   Variants (2 × 2 = 4):
     Small  / Classic
     Small  / Chocolate
     Large  / Classic
     Large  / Chocolate
```

Two things worth knowing now, because they're real constraints you'll hit:

- A product can have up to **3 options** (e.g. Size, Flavor, Packaging). This is a hard Shopify limit.
- More options means multiplicatively more variants. 3 options with 5 values each = 125 variants. That's a lot of prices and stock counts to manage — a practical reason to keep options lean.

(Note: for Himang, "Classic" vs "Chocolate" vs "Matcha" tiramisu are modeled as **separate products** in this course, because they have different descriptions and photos. Whether something is an *option value* or a whole *separate product* is a modeling judgment — covered in Common Misconceptions below.)

---

## Architecture

The full shape of the object, before we look at any JSON:

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

The catalog-level facts (title, images) sit on the Product. The sellable facts (price, stock) sit on the Variant. A cart line, a draft order line, an order line — all point at a **variant**.

---

## REST Implementation

We haven't set up authentication yet — that's [Section 03](../03-rest-api/) — so we won't *run* this. But seeing the JSON shape makes the concept concrete. Here's a trimmed response from fetching Himang's Classic Tiramisu product:

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
      {
        "id": 9001,
        "product_id": 8001,
        "title": "Small",
        "option1": "Small",
        "price": "300.00",
        "sku": "TIRA-CLS-S",
        "inventory_quantity": 40
      },
      {
        "id": 9002,
        "product_id": 8001,
        "title": "Large",
        "option1": "Large",
        "price": "550.00",
        "sku": "TIRA-CLS-L",
        "inventory_quantity": 12
      }
    ]
  }
}
```

Read this top-down and the whole chapter is right there in the data:

- The **product** (`id: 8001`) holds the catalog stuff: `title`, `body_html` (the description), `vendor`, and the list of `options`.
- The **product has no `price` field.** Look for it — it isn't there. Price lives one level down.
- The **`variants` array** holds the two sellable versions. Each variant has its **own `id`**, its own `price`, its own `sku`, its own `inventory_quantity`.
- Each variant carries a **`product_id`** pointing back up to `8001` — the "belongs to" link.
- The IDs to remember: the **product ID is `8001`**; the **variant IDs are `9001` and `9002`**. When you build a draft order in Section 03, you'll pass `9001` or `9002`. Passing `8001` is the classic mistake.

---

## GraphQL Implementation

We cover GraphQL properly in [Section 05](../05-graphql/); here's the same data in its shape, so the REST/GraphQL parallel is visible early.

```graphql
query {
  product(id: "gid://shopify/Product/8001") {
    title
    options { name values }
    variants(first: 10) {
      edges {
        node {
          id
          title
          price
          sku
          inventoryQuantity
        }
      }
    }
  }
}
```

Two differences to just *notice* now (don't worry about mastering them):

1. **IDs look different.** GraphQL uses **global IDs** like `gid://shopify/Product/8001` and `gid://shopify/ProductVariant/9001` — a URI that encodes the object *type* and the number. REST used the bare integer `8001`. Same underlying object, different ID format. (Full explanation in [Section 05](../05-graphql/).)
2. **Variants come wrapped in `edges`/`node`.** GraphQL calls a one-to-many relationship a *connection* and wraps each item in a `node`. It looks like extra ceremony; it's what enables pagination. Also Section 05.

The concept is identical to REST: a product, its options, and a list of variants where price and stock live. Only the packaging differs.

---

## Production Considerations

- **Always store and pass variant IDs for anything transactional.** Carts, draft orders, orders, inventory adjustments — all operate on variants. If your database models "what did the customer buy," the foreign key is the *variant* ID.
- **Don't assume a product's price.** A product can have variants at different prices. "The price of Classic Tiramisu" is only meaningful per variant. UIs that show "from ₹300" are showing the *minimum variant price*, not a product price.
- **Watch variant explosion.** Options multiply. Three options with several values each can produce hundreds of variants, each needing its own price and stock. Keep options minimal; model genuinely different items as separate products.
- **The default variant is real.** Even single-option products have one variant (often titled "Default Title"). Code that lists variants should handle the "exactly one variant" case as normal, not special.
- **SKUs are yours, IDs are Shopify's.** The `sku` is the merchant's own code and can be blank or duplicated; the variant `id` is Shopify's guaranteed-unique identifier. Key your logic off the `id`, not the SKU.

---

## Common Misconceptions

**❌ "A customer buys a product."**
Reality: A customer buys a *variant* — a specific version with a definite price and stock. The product is just the catalog grouping.

**❌ "A product has a price."**
Reality: Price lives on the variant. A product with variants at ₹300 and ₹550 has no single price of its own.

**❌ "If a product has no options, it has no variant."**
Reality: Every product has at least one variant — a default variant that holds the price and stock. There is no directly-purchasable product.

**❌ "I can create an order using a product ID."**
Reality: Order and draft-order line items require a **variant** ID. Passing a product ID is the single most common first-timer error, and it's exactly what this repository's draft-order pipeline gets right.

**❌ "Different flavors must be options on one product."**
Reality: It's a modeling choice. If Classic/Chocolate/Matcha share nothing (different photos, descriptions, even audiences), model them as **separate products**. If they're truly interchangeable versions of one item (like sizes), use **options** on one product. Judgment, not a rule.

---

## Frequently Asked Questions

**Q: Why are Product IDs different from Variant IDs?**
Because they identify different objects. The product is the catalog entry (`8001`); each variant is a distinct sellable unit (`9001`, `9002`) with its own price and stock. They must be distinct so an order can point at the exact thing being sold. Confusing them is why beginners' first order-creation calls fail.

**Q: Why doesn't a product just have a price field to keep things simple?**
Because a product can legitimately have several prices (one per variant). Putting price on the product would break the moment a product has two sizes. Price lives where it's unambiguous: the variant.

**Q: What exactly is a SKU, and do I need one?**
SKU = *Stock Keeping Unit*, the merchant's internal code for an item (e.g. `TIRA-CLS-S`). It's for the merchant's own inventory systems and is optional. Don't use it as a database key — it can be blank or non-unique. Use the variant `id`.

**Q: My store shows one variant called "Default Title." Did I do something wrong?**
No. That's the default variant Shopify creates for a product with no options. It's holding your price and stock. Everything's normal.

**Q: How many variants can a product have?**
A product can have up to 3 options, and the variants are the combinations of their values (a Shopify limit applies to the total). The practical advice: keep options few, or you drown in variants to manage.

---

## Interview Questions

1. In one sentence each, what is a Product and what is a Variant?
2. Where does price live — on the Product or the Variant — and why?
3. Does a product with no options have any variants? Explain.
4. When creating a draft order or order line item, which ID do you pass, and why does the other one fail?
5. What is an "option," and how do options relate to variants?
6. Give the analogy that captures Product vs. Variant. (Class/instance or sign/box.)
7. Why is the variant `id` a better database key than the `sku`?

---

## Summary

- A **Product** is the catalog concept (title, description, images); a **Variant** is a specific, purchasable version (its own price, SKU, inventory).
- **Customers buy variants, not products.** The product is a grouping; the variant is the sellable unit.
- **Price, SKU, inventory, weight, barcode live on the Variant** — the product has no price of its own.
- **Every product has at least one variant**, even with no options (the default variant). There is no directly-purchasable product.
- **Options** (Size, Flavor…) define variants; variants are the combinations of option values. Max 3 options; they multiply fast.
- REST uses bare integer IDs (product `8001`, variant `9001`); GraphQL uses **global IDs** (`gid://shopify/ProductVariant/9001`) and wraps variants in `edges`/`node`. Same concept, different packaging.
- The number to remember for the whole course: **transactional operations use the *variant* ID.**

---

## What's Next

You now hold the concept the entire pipeline depends on: the customer buys a variant, and the variant ID is what every order references.

→ **Next chapter: Customers** — the second object in the data model, and (recalling Chapter 02) the owned asset that makes a "sell over the phone" draft order possible. After that we reach the star of this repository: the **Draft Order**.
