// config.js — read configuration from the environment, once.
//
// Secrets NEVER go in code. This app reads them from process.env, loading a
// local app/.env file via dotenv if one exists. Real environment variables
// still win over the file (dotenv does not override already-set vars).

const path = require("path");

// Load app/.env into process.env (explicit path so it works regardless of cwd).
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

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
