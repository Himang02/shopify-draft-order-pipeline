// webhook-server.js — a minimal, correct Shopify webhook receiver.
//
// Introduced across: 04-webhooks/ (chapters 03, 04, 05)
//
// Demonstrates the full correct handler:
//   1. read the RAW body (express.raw)          — chapter 03
//   2. verify the HMAC (constant-time)           — chapter 04
//   3. check freshness (timestamp tolerance)     — chapter 05
//   4. parse JSON only after verifying           — chapter 03/04
//   5. dedupe for idempotency                    — chapter 05
//   6. acknowledge fast with 200
//
// Usage:
//   export SHOPIFY_WEBHOOK_SECRET="your_webhook_signing_secret"
//   node webhook-server.js
//   # then expose it: ngrok http 3000   (chapter 02)
//
// Requires: Node.js 18+, and `npm install express`.

const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// --- Chapter 04: verify the HMAC over the RAW bytes, in constant time. ---
function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!WEBHOOK_SECRET || !hmacHeader) return false;
  const digest = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody) // raw bytes, NOT a re-serialized object
    .digest("base64");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  if (a.length !== b.length) return false; // timingSafeEqual needs equal lengths
  return crypto.timingSafeEqual(a, b);
}

// --- Chapter 05: freshness — reject webhooks outside a tolerance window. ---
function isFresh(triggeredAt, toleranceMs = 5 * 60 * 1000) {
  if (!triggeredAt) return true; // header absent: skip this optional check
  const sent = new Date(triggeredAt).getTime();
  if (Number.isNaN(sent)) return false;
  return Math.abs(Date.now() - sent) <= toleranceMs;
}

// --- Chapter 05: idempotency — dedupe on a stable key. ---
// Demo only: an in-memory set. Use a durable store with a UNIQUE constraint
// in production so duplicates can't both be processed (even across restarts).
const processed = new Set();

// Chapter 03: express.raw ONLY on the webhook route, so req.body is a Buffer.
app.post(
  "/webhooks/orders",
  express.raw({ type: "application/json" }),
  (req, res) => {
    // 1 + 2: verify the signature against the raw bytes.
    if (!verifyShopifyWebhook(req.body, req.get("X-Shopify-Hmac-Sha256"))) {
      return res.sendStatus(401); // fail closed
    }

    // 3: optional freshness bound.
    if (!isFresh(req.get("X-Shopify-Triggered-At"))) {
      return res.sendStatus(401);
    }

    // 4: only now is it safe to parse.
    const order = JSON.parse(req.body.toString("utf8"));
    const topic = req.get("X-Shopify-Topic") || "orders/unknown";

    // 5: idempotency — process each event once.
    const key = `${topic}:${order.id}`;
    if (processed.has(key)) {
      console.log(`Duplicate ${key} — already handled, skipping.`);
      return res.sendStatus(200); // ack duplicates too
    }
    processed.add(key);

    // 6: acknowledge fast; do heavy work asynchronously in real code.
    console.log(`Verified ${key}: financial_status=${order.financial_status}`);
    res.sendStatus(200);
  }
);

// Other routes may safely use the JSON parser.
app.use(express.json());

app.get("/health", (_req, res) => res.send("ok"));

app.listen(PORT, () => {
  if (!WEBHOOK_SECRET) {
    console.warn("WARNING: SHOPIFY_WEBHOOK_SECRET is not set — all webhooks will 401.");
  }
  console.log(`Webhook server listening on http://localhost:${PORT}`);
  console.log("Expose it with: ngrok http " + PORT);
});
