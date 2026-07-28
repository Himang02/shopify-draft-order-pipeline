// create-draft-order.js — create an open draft order for Alice.
//
// Introduced in: 03-rest-api/04-creating-a-draft-order.md
//
// Usage:
//   export SHOPIFY_STORE="himangs-tiramisu.myshopify.com"
//   export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxx"
//   export VARIANT_ID=9002      # Large Classic Tiramisu (from chapter 02)
//   export CUSTOMER_ID=7001     # Alice (from chapter 03)
//   node create-draft-order.js
//
// Requires Node.js 18+ (built-in global fetch).

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API = "2024-10";

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

// Pass real IDs from the earlier chapters/examples.
const VARIANT_ID = Number(process.env.VARIANT_ID || 9002); // Large Classic Tiramisu
const CUSTOMER_ID = Number(process.env.CUSTOMER_ID || 7001); // Alice

async function createDraftOrder() {
  const { draft_order } = await shopify("draft_orders.json", {
    method: "POST",
    body: {
      draft_order: {
        line_items: [{ variant_id: VARIANT_ID, quantity: 2 }],
        customer: { id: CUSTOMER_ID },
        use_customer_default_address: true,
      },
    },
  });
  return draft_order;
}

async function main() {
  if (!SHOP || !TOKEN) throw new Error("Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN.");
  const d = await createDraftOrder();
  console.log(`Draft order ${d.id} — status: ${d.status}`);
  console.log(`  subtotal ₹${d.subtotal_price}  tax ₹${d.total_tax}  total ₹${d.total_price}`);
  console.log(`  order_id (should be null): ${d.order_id}`);
  console.log(`  invoice_url: ${d.invoice_url}`);
  console.log(`\nNext: send the invoice or complete draft ${d.id} (chapters 05-06).`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
