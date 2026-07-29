// config.js — read configuration from the environment, once.
//
// Secrets NEVER go in code. This app reads them from process.env.
// A tiny .env loader is included so you can keep a local .env file
// without adding a dependency (see loadDotEnv below).

const fs = require("fs");
const path = require("path");

// Minimal .env loader: parses KEY=VALUE lines from app/.env if present.
// (For real projects, use a library like dotenv; this keeps deps at zero.)
function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const config = {
  shop: process.env.SHOPIFY_STORE,
  token: process.env.SHOPIFY_ACCESS_TOKEN,
  apiVersion: process.env.SHOPIFY_API_VERSION || "2024-10",
  webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || "",
  port: Number(process.env.PORT || 3000),
};

function assertConfigured() {
  const missing = [];
  if (!config.shop) missing.push("SHOPIFY_STORE");
  if (!config.token) missing.push("SHOPIFY_ACCESS_TOKEN");
  if (missing.length) {
    throw new Error(
      `Missing required env vars: ${missing.join(", ")}. ` +
        `Copy app/.env.example to app/.env and fill them in.`
    );
  }
}

module.exports = { config, assertConfigured };
