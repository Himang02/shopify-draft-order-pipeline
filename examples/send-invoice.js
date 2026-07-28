// send-invoice.js — email a draft order's invoice to the customer.
//
// Introduced in: 03-rest-api/05-invoice-urls.md
//
// Usage:
//   export SHOPIFY_STORE="himangs-tiramisu.myshopify.com"
//   export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxx"
//   export DRAFT_ORDER_ID=5001
//   node send-invoice.js
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

  // Option A: read the link without sending an email.
  const { draft_order } = await shopify(`draft_orders/${DRAFT_ID}.json`);
  console.log("Invoice URL (share it yourself if you prefer):");
  console.log("  " + draft_order.invoice_url);

  // Option B: have Shopify email the invoice (moves status to invoice_sent).
  await shopify(`draft_orders/${DRAFT_ID}/send_invoice.json`, {
    method: "POST",
    body: {
      draft_order_invoice: {
        custom_message: "Thanks for calling in, Alice! Here's your invoice.",
      },
    },
  });

  const { draft_order: after } = await shopify(`draft_orders/${DRAFT_ID}.json`);
  console.log(`Invoice sent. Draft ${after.id} status is now: ${after.status}`);
  console.log("No order exists yet — Alice must pay via the link (chapter 06).");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
