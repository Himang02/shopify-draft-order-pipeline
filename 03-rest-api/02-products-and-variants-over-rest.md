# Products & Variants over REST

Now we use the auth from [Chapter 01](01-authentication-and-access-tokens.md) on the catalog. The concept is from [Section 02, Ch. 02](../02-shopify-data-model/02-products-vs-variants.md) — product as catalog entry, variant as sellable unit. This turns it into real calls, ending with what the pipeline needs: **variant IDs**.

---

## Business Problem

Before Himang can take Alice's order, the tiramisus must be *in* the store, and your draft-order code needs the variant's **ID** (`9002`). Two tasks:

1. **Create** products (with variants).
2. **List / fetch** products to discover variant IDs.

Both are plain REST over the auth pattern you just learned.

---

## Mental Model

> A product **contains** its variants — you create a product *with* its variants in one call, and reading a product returns its variants nested inside.

And the load-bearing rule:

> **Everything transactional uses the *variant* ID, never the product ID.** Getting those IDs is this chapter's real goal.

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

All calls reuse the auth pattern: the `myshopify.com` URL, pinned version, and token header.

### Create a product with variants

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

- **`title`, `body_html`, `vendor`** — catalog facts, on the product.
- **`options`** — the "Size" dimension defining what variants vary by.
- **`variants[]`** — each with its own `price`, `sku`, `inventory_quantity`, and an `option1`. **No price on the product** — it lives here.

Shopify responds with server-assigned IDs:

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

Those `variants[].id` values (`9001`, `9002`) are what the draft-order chapter consumes. **Capture them.**

### List products / fetch one

```
GET /admin/api/2024-10/products.json?limit=50   → { "products": [ … ] }, each with nested variants
GET /admin/api/2024-10/products/8001.json        → a single product
```

To find a variant, locate the product, then the variant by its option, and read `variant.id`.

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

The `shopify()` helper — read env, build URL, send token, check `res.ok`, return JSON — is Chapter 01's pattern factored out, reused everywhere after. Copy in [`examples/products.js`](../examples/products.js).

---

## GraphQL Implementation

The same two operations in GraphQL ([Section 05](../05-graphql/)):

- **Read:** the `products` query with a `variants` connection (`edges`/`node`, global IDs).
- **Create:** `productCreate` (plus `productVariantsBulkCreate` for variants in current versions), returning the product and a `userErrors` array.

The difference: GraphQL fetches **exactly the fields you want** — just each variant's `id` — instead of the whole product. When "I only need IDs" meets "don't over-fetch," GraphQL wins (Section 05).

---

## Production Considerations

- **Capture variant IDs at creation** — the `POST` response has them; don't re-list later.
- **Paginate when listing** — `GET /products.json` returns one page; use cursor pagination (`Link` header) for the rest.
- **Inventory is per-location.** The creation-time `inventory_quantity` is a convenience; real inventory is adjusted through inventory endpoints.
- **Creation isn't idempotent** — two `POST`s make two products. When syncing, look up by a stable key first.
- **Respect rate limits** — handle `429` by backing off ([Section 10](../10-production/)).

---

## Common Misconceptions

**❌ "I create the product, then its variants separately."**
You can create a product *with* its variants in one `POST`.

**❌ "The product has the price."**
Price is on each **variant**. The product JSON has no price field.

**❌ "One `GET /products.json` returns my whole catalog."**
One page. Use cursor pagination for the rest.

**❌ "I'll use the product ID for the order."**
The **variant** ID. Getting those is why this chapter exists.

---

## Frequently Asked Questions

**Q: I created a product with no options/variants — does it have a variant?**
Yes — Shopify creates a **default variant** holding the price/stock. Use *its* ID.

**Q: How do I set different prices per size?**
Put the price on each variant (Small `300.00`, Large `550.00`). That's why variants exist.

**Q: How do I find the variant ID of an existing product?**
`GET` the product (or list products) and read `variants[].id`.

**Q: Can I update a variant's price later?**
Yes (`PUT /variants/{id}.json`). Past orders keep their snapshotted price; only future sales change.

---

## Interview Questions

1. In one `POST`, what creates a product with two sizes at different prices?
2. Where does price live in the payload, and where doesn't it?
3. After creating, where are the variant IDs, and why do you want them?
4. Why can't one `GET /products.json` return the whole catalog?
5. Why isn't product creation idempotent, and how do you avoid duplicates?
6. In GraphQL, what's the advantage when you only need variant IDs?

---

## Summary

- Reusing the auth pattern, **create products with nested variants** via `POST /products.json`, and **list/fetch** via `GET`.
- **Price, SKU, inventory go on each variant**, not the product.
- The payoff is the **variant IDs** in the response — capture them.
- Listing is **paginated**, creation is **not idempotent**, inventory is **per-location**.
- GraphQL does the same with a `variants` connection and `productCreate`, fetching only what you need.

---

## What's Next

You have the "what" of a sale. Next, the "who."

→ **Next: [Customers over REST](03-customers-over-rest.md)** — find-or-create by email, producing the customer ID the draft order references.
