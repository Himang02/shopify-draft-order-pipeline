// complete-draft-order.js — complete a draft order into a real order (Path B).
//
// Introduced in: 03-rest-api/06-completing-a-draft-order.md
//
// Usage:
//   export SHOPIFY_STORE="himangs-tiramisu.myshopify.com"
//   export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxx"
//   export DRAFT_ORDER_ID=5001
//   node complete-draft-order.js
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

const DRAFT_ID = Number(process.env.DRAFT_ORDER_ID || 5001);

async function main() {
  if (!SHOP || !TOKEN) throw new Error("Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN.");

  // Mark as paid (payment already collected out-of-band).
  const { draft_order } = await shopify(
    `draft_orders/${DRAFT_ID}/complete.json?payment_pending=false`,
    { method: "PUT" }
  );
  console.log(`Draft ${draft_order.id} → status: ${draft_order.status}`);
  console.log(`  order_id is now: ${draft_order.order_id}`); // was null before!

  // Inspect the freshly created order.
  const { order } = await shopify(`orders/${draft_order.order_id}.json`);
  console.log(`Order ${order.name} (id ${order.id})`);
  console.log(`  financial_status:   ${order.financial_status}`);
  console.log(`  fulfillment_status: ${order.fulfillment_status}`); // null = unfulfilled
  console.log(`  total: ₹${order.total_price}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
