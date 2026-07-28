# Products & Variants over REST

The [previous chapter](01-authentication-and-access-tokens.md) got you authenticated. Now we use that to work with the catalog. The concept is already yours from [Section 02, Ch. 02](../02-shopify-data-model/02-products-vs-variants.md) — product as catalog entry, variant as sellable unit. This chapter turns that into real REST calls, ending with the thing the pipeline actually needs: **variant IDs**.

---

## Business Problem

Before Himang can take Alice's order, the store needs the tiramisus *in it*. And before your draft-order code can add "2 × Large Classic Tiramisu" to an order, it needs to know that variant's **ID** (`9002`, in our running example). So two practical tasks:

1. **Create** products (with their variants) in the store.
2. **List / fetch** products to discover variant IDs to use later.

Both are plain REST over the auth pattern you just learned.

---

## Mental Model

Nothing new conceptually — just recall the shape and remember one rule:

> A product **contains** its variants. In REST, you create a product *with* its variants in one call, and when you read a product, its variants come nested inside it.

And the load-bearing rule from Section 02, restated because the whole pipeline hinges on it:

> **Everything transactional uses the *variant* ID, never the product ID.** This chapter's real goal is to get those variant IDs.

---

## Architecture

```
   Your Server ──POST /products.json──►  Shopify creates a PRODUCT
                                          + its VARIANT(s) in one shot
                                                     │
   Your Server ──GET /products.json──►   Shopify returns products,
                                          each with nested variants
                                                     │
                                          you read variants[].id  ◄── the payoff
```

---

## REST Implementation

All calls reuse the authenticated request pattern: the `myshopify.com` URL, the pinned version, and the `X-Shopify-Access-Token` header. We'll show the HTTP first, then runnable Node.

### Create a product with variants

Himang's Classic Tiramisu in two sizes:

```
POST /admin/api/2024-10/products.json
```

```json
{
  "product": {
    "title": "Classic Tiramisu",
    "body_html": "<p>Our signature coffee-soaked classic.</p>",
    "vendor": "Himang's Tiramisu",
    "options": [{ "name": "Size", "values": ["Small", "Large"] }],
    "variants": [
      { "option1": "Small", "price": "300.00", "sku": "TIRA-CLS-S", "inventory_quantity": 40 },
      { "option1": "Large", "price": "550.00", "sku": "TIRA-CLS-L", "inventory_quantity": 12 }
    ]
  }
}
```

Field by field:

- **`title`, `body_html`, `vendor`** — catalog-level facts, on the *product* (per Section 02).
- **`options`** — the "Size" dimension with its values. This defines what the variants vary by.
- **`variants[]`** — the sellable units. Each carries its own **`price`, `sku`, `inventory_quantity`**, and an `option1` matching a Size value. Notice: **no price on the product** — it lives here.

Shopify responds with the created product, now with **server-assigned IDs**:

```json
{
  "product": {
    "id": 8001,
    "title": "Classic Tiramisu",
    "variants": [
      { "id": 9001, "product_id": 8001, "option1": "Small", "price": "300.00" },
      { "id": 9002, "product_id": 8001, "option1": "Large", "price": "550.00" }
    ]
  }
}
```

Those `variants[].id` values (`9001`, `9002`) are what the draft-order chapter will consume. **Capture them.**

### List products and extract variant IDs

```
GET /admin/api/2024-10/products.json?limit=50
```

Returns `{ "products": [ … ] }`, each product with its nested `variants`. To find "Large Classic Tiramisu," you locate the product by title, then the variant by its option — reading `variant.id` out.

### Fetch one product

```
GET /admin/api/2024-10/products/8001.json
```

Returns a single product (with variants) when you already know its ID.

### Runnable Node example

```javascript
// products.js — create a product, then list products and print variant IDs.
// Introduced in: 03-rest-api/02-products-and-variants-over-rest.md
// Node 18+.  Env: SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API = "2024-10";

// A tiny helper so we don't repeat auth/URL/error handling on every call.
async function shopify(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/${API}/${path}`, {
    method,
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}\n${await res.text()}`);
  }
  return res.json();
}

async function createClassicTiramisu() {
  const { product } = await shopify("products.json", {
    method: "POST",
    body: {
      product: {
        title: "Classic Tiramisu",
        body_html: "<p>Our signature coffee-soaked classic.</p>",
        vendor: "Himang's Tiramisu",
        options: [{ name: "Size", values: ["Small", "Large"] }],
        variants: [
          { option1: "Small", price: "300.00", sku: "TIRA-CLS-S", inventory_quantity: 40 },
          { option1: "Large", price: "550.00", sku: "TIRA-CLS-L", inventory_quantity: 12 },
        ],
      },
    },
  });
  console.log(`Created product ${product.id}: ${product.title}`);
  for (const v of product.variants) {
    console.log(`  variant ${v.id}  ${v.option1}  ₹${v.price}`);
  }
  return product;
}

async function listVariantIds() {
  const { products } = await shopify("products.json?limit=50");
  console.log(`\nStore has ${products.length} product(s):`);
  for (const p of products) {
    for (const v of p.variants) {
      console.log(`  ${p.title} — ${v.option1}: variant_id=${v.id}`);
    }
  }
}

async function main() {
  if (!SHOP || !TOKEN) throw new Error("Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN.");
  await createClassicTiramisu();
  await listVariantIds();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
```

The `shopify()` helper — read env, build URL, send token header, check `res.ok`, return JSON — is the same pattern from Chapter 01, factored out so it's written once and reused. Every later chapter builds on this helper. A copy lives in [`examples/products.js`](../examples/products.js).

---

## GraphQL Implementation

The same two operations in GraphQL (full treatment in [Section 05](../05-graphql/)):

- **Read:** the `products` query with a `variants` connection — you saw this shape in Section 02, with `edges`/`node` and global IDs (`gid://shopify/ProductVariant/9002`).
- **Create:** the `productCreate` mutation (with `productVariantsBulkCreate` for variants in current API versions), returning the product and a `userErrors` array to check.

The difference worth flagging now: in GraphQL you **ask for exactly the fields you want** — e.g. just each variant's `id` — instead of getting the whole product object and digging out one field. When "I only need variant IDs" meets "don't over-fetch," GraphQL is often the cleaner tool. That trade-off is Section 05's story.

---

## Production Considerations

- **Capture variant IDs at creation time.** The `POST` response already contains them — store them then, rather than re-listing later.
- **Paginate when listing.** `GET /products.json` returns a page (default/max sizes apply). Real catalogs need pagination via the `Link` header (cursor-based). Don't assume one call returns everything.
- **Inventory is more than a number.** Setting `inventory_quantity` at creation is fine for a demo, but real inventory is tracked per *location* and adjusted through inventory endpoints. Treat the creation-time quantity as a starting convenience, not the full system.
- **Creating is not idempotent.** `POST /products.json` twice makes two products. If you sync catalogs, look up by a stable key (like SKU or your own reference) before creating, or you'll get duplicates.
- **Respect rate limits.** Bulk-creating many products can hit the leaky-bucket limit; handle `429` by backing off ([Section 10](../10-production/)).

---

## Common Misconceptions

**❌ "I create the product first, then create its variants in a second call."**
Reality: You can create a product *with* its variants in one `POST`. (You *can* add variants later too, but the single-call form is normal.)

**❌ "The product has the price."**
Reality: Price is on each **variant** in the `variants[]` array. The product JSON has no price field. (Section 02, again.)

**❌ "One `GET /products.json` returns my whole catalog."**
Reality: It returns one page. Use cursor pagination (the `Link` header) for the rest.

**❌ "I'll use the product ID for the order later."**
Reality: You'll use the **variant** ID. Getting those IDs is the reason this chapter exists.

---

## Frequently Asked Questions

**Q: I created a product with no `options`/`variants` block. Does it have a variant?**
Yes — Shopify creates a **default variant** (Section 02). Read it back and you'll find one variant holding the price/stock. Use *its* ID for transactions.

**Q: How do I set different prices per size?**
Put the price on each variant. Small at `300.00`, Large at `550.00`, as in the example. That's exactly why variants exist.

**Q: How do I find the variant ID for an existing product I didn't just create?**
`GET` the product (or list products) and read `variants[].id` from the nested array. The example's `listVariantIds()` does this.

**Q: Can I update a variant's price later?**
Yes, via the variant update endpoint (`PUT /variants/{id}.json`). Note that past *orders* keep their snapshotted price (Section 02, Ch. 05) — updating the variant only affects future sales.

---

## Interview Questions

1. In one `POST`, what do you send to create a product with two sizes at different prices?
2. Where does price live in the product-create payload, and where does it *not*?
3. After creating a product, where do you find the variant IDs, and why do you want them?
4. Why can't you rely on a single `GET /products.json` to return an entire catalog?
5. Why is product creation not idempotent, and how do you avoid duplicates when syncing?
6. In GraphQL, what's the advantage when all you need is variant IDs?

---

## Summary

- Reusing the Chapter 01 auth pattern, you **create products with nested variants** in one `POST /products.json`, and **list/fetch** them via `GET`.
- **Price, SKU, and inventory go on each variant**, not the product — exactly as Section 02 said.
- The real payoff is the **variant IDs** in the response (`9001`, `9002`); capture them, because the draft-order pipeline consumes them.
- Listing is **paginated**, creation is **not idempotent**, and inventory is really per-location — plan for all three in production.
- GraphQL does the same with a `variants` connection and `productCreate`, with the bonus of fetching *only* the fields you need (Section 05).

---

## What's Next

You have variants and their IDs — the "what" of a sale. Next, the "who."

→ **Next chapter: [Customers over REST](03-customers-over-rest.md)** — create and look up customers (find-or-create by email), producing the customer ID the draft order will reference.
