// server.js — a minimal admin UI backend for the draft-order pipeline.
//
// Architecture (Section 01 trust boundary):
//
//   browser (public/*)  ──fetch /api/*──►  THIS server  ──Admin API──►  Shopify
//                                              │  (holds the secret token)
//   Shopify  ──webhook POST /webhooks/orders──►┘
//
// The browser never sees the access token. It calls our own /api/* routes,
// which proxy to Shopify server-side.

const path = require("path");
const express = require("express");

const { config, assertConfigured } = require("./lib/config");
const { rest } = require("./lib/shopify");
const { verifyWebhook } = require("./lib/verify-webhook");

const app = express();

// ---------------------------------------------------------------------------
// Webhook route FIRST, with express.raw — it needs the exact raw bytes for
// HMAC verification (Section 04, ch. 03). express.json() must not touch it.
// ---------------------------------------------------------------------------
const seenWebhooks = new Set(); // demo idempotency store (use a DB in production)
const recentWebhooks = []; // in-memory log of recent webhooks, surfaced in the UI

app.post("/webhooks/orders",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const hmac = req.get("X-Shopify-Hmac-Sha256");
    if (!verifyWebhook(req.body, hmac)) {
      console.warn("[webhook] REJECTED — HMAC verification failed");
      return res.sendStatus(401); // fail closed
    }

    const topic = req.get("X-Shopify-Topic") || "orders/unknown";
    const order = JSON.parse(req.body.toString("utf8")); // safe only after verify

    const key = `${topic}:${order.id}`;
    console.log("webhook received, key (topic : order-id) -> ", key);
    if (seenWebhooks.has(key)) {
      console.log(`[webhook] duplicate ${key} — skipping`);
      return res.sendStatus(200);
    }
    seenWebhooks.add(key);

    recentWebhooks.unshift({
      topic,
      orderId: order.id,
      name: order.name,
      financialStatus: order.financial_status,
      at: new Date().toISOString(),
    });
    recentWebhooks.length = Math.min(recentWebhooks.length, 40); // keep last 40

    console.log(`[webhook] ${key} verified — ${order.name} (${order.financial_status})`);
    res.sendStatus(200); // acknowledge fast
  }
);

// ---------------------------------------------------------------------------
// Everything else can use the JSON body parser and static file serving.
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Small helper: run a Shopify call and translate errors to clean JSON.
function handle(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req, res);
      res.json(data);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({
        error: err.message,
        shopify: err.shopifyBody, // Shopify's own error detail, if any
      });
    }
  };
}

// --- Store info (auth check) ----------------------------------------------
app.get(
  "/api/shop",
  handle(async () => {
    const { shop } = await rest("shop.json");
    return {
      name: shop.name,
      domain: shop.myshopify_domain,
      currency: shop.currency,
      apiVersion: config.apiVersion, // the pinned Admin API version
    };
  })
);

// --- Products & variants ---------------------------------------------------
app.get(
  "/api/products",
  handle(async () => {
    const { products } = await rest("products.json?limit=50");
    // Flatten to just what the UI needs.
    return products.map((p) => ({
      id: p.id,
      title: p.title,
      variants: p.variants.map((v) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        sku: v.sku,
        inventory: v.inventory_quantity,
      })),
    }));
  })
);

// --- Customers -------------------------------------------------------------
app.get(
  "/api/customers",
  handle(async (req) => {
    const q = (req.query.q || "").trim();
    const path = q
      ? `customers/search.json?query=${encodeURIComponent(q)}`
      : "customers.json?limit=50";
    const { customers } = await rest(path);
    return customers.map((c) => ({
      id: c.id,
      email: c.email,
      name: [c.first_name, c.last_name].filter(Boolean).join(" "),
      ordersCount: c.orders_count,
    }));
  })
);

// find-or-create a customer by email (Section 03, ch. 03)
app.post(
  "/api/customers",
  handle(async (req) => {
    const { email, firstName, lastName, address } = req.body;
    if (!email) {
      const e = new Error("email is required");
      e.status = 400;
      throw e;
    }

    const found = await rest(
      `customers/search.json?query=${encodeURIComponent("email:" + email)}`
    );
    if (found.customers && found.customers[0]) {
      return { customer: found.customers[0], created: false };
    }

    const { customer } = await rest("customers.json", {
      method: "POST",
      body: {
        customer: {
          email,
          first_name: firstName,
          last_name: lastName,
          addresses: address ? [{ ...address, default: true }] : [],
        },
      },
    });
    return { customer, created: true };
  })
);

// --- Draft orders ----------------------------------------------------------
app.get(
  "/api/draft-orders",
  handle(async () => {
    const { draft_orders } = await rest("draft_orders.json?limit=50");
    return draft_orders.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      total: d.total_price,
      customer: d.customer ? d.customer.email : null,
      orderId: d.order_id,
      invoiceUrl: d.invoice_url,
    }));
  })
);

// create a draft order (Section 03, ch. 04)
app.post(
  "/api/draft-orders",
  handle(async (req) => {
    const { lineItems, customerId } = req.body;
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      const e = new Error("lineItems (variantId + quantity) are required");
      e.status = 400;
      throw e;
    }
    const draft = {
      line_items: lineItems.map((li) => ({
        variant_id: Number(li.variantId),
        quantity: Number(li.quantity),
      })),
    };
    if (customerId) {
      draft.customer = { id: Number(customerId) };
      draft.use_customer_default_address = true;
    }
    const { draft_order } = await rest("draft_orders.json", {
      method: "POST",
      body: { draft_order: draft },
    });
    return draft_order;
  })
);

// send the invoice email (Section 03, ch. 05)
app.post(
  "/api/draft-orders/:id/send-invoice",
  handle(async (req) => {
    const { draft_order_invoice } = await rest(
      `draft_orders/${req.params.id}/send_invoice.json`,
      { method: "POST", body: { draft_order_invoice: {} } }
    );
    return { sent: true, invoice: draft_order_invoice || null };
  })
);

// complete a draft order -> real order (Section 03, ch. 06) = "mark paid"
app.post(
  "/api/draft-orders/:id/complete",
  handle(async (req) => {
    const pending = req.query.paymentPending === "true";
    const { draft_order } = await rest(
      `draft_orders/${req.params.id}/complete.json?payment_pending=${pending}`,
      { method: "PUT" }
    );
    return draft_order;
  })
);

// --- Orders ----------------------------------------------------------------
app.get(
  "/api/orders",
  handle(async () => {
    const { orders } = await rest("orders.json?status=any&limit=50");
    return orders.map((o) => ({
      id: o.id,
      name: o.name,
      financialStatus: o.financial_status,
      fulfillmentStatus: o.fulfillment_status, // null = unfulfilled
      total: o.total_price,
      customer: o.customer ? o.customer.email : null,
      createdAt: o.created_at,
    }));
  })
);

// --- Recently received webhooks (for the UI) ------------------------------
app.get("/api/webhooks/recent", (_req, res) => res.json(recentWebhooks));

// ---------------------------------------------------------------------------
app.listen(config.port, () => {
  try {
    assertConfigured();
    console.log(`Mini-admin running at http://localhost:${config.port}`);
    console.log(`Store: ${config.shop} (API ${config.apiVersion})`);
  } catch (e) {
    console.error("CONFIG ERROR:", e.message);
  }
  if (!config.webhookSecret) {
    console.warn(
      "WARNING: SHOPIFY_WEBHOOK_SECRET not set — /webhooks/orders will 401 all requests."
    );
  }
});
