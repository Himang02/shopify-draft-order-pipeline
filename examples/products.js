// products.js — create a product, then list products and print variant IDs.
//
// Introduced in: 03-rest-api/02-products-and-variants-over-rest.md
//
// Usage:
//   export SHOPIFY_STORE="himangs-tiramisu.myshopify.com"
//   export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxx"
//   node products.js
//
// Requires Node.js 18+ (built-in global fetch).

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
