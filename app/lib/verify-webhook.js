// verify-webhook.js — HMAC verification for incoming Shopify webhooks.
//
// This is the Section 04 logic: recompute HMAC-SHA256 over the RAW body
// with the webhook signing secret, and compare in constant time.

const crypto = require("crypto");
const { config } = require("./config");

// rawBody: a Buffer (from express.raw) — the EXACT bytes Shopify sent.
// hmacHeader: value of the X-Shopify-Hmac-Sha256 header (base64).
function verifyWebhook(rawBody, hmacHeader) {
  if (!config.webhookSecret) return false; // not configured -> cannot verify
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(rawBody) // raw bytes, not a re-serialized object
    .digest("base64");

  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  if (a.length !== b.length) return false; // timingSafeEqual needs equal lengths
  return crypto.timingSafeEqual(a, b);
}

module.exports = { verifyWebhook };
