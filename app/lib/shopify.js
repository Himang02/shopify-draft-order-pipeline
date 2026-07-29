// shopify.js — the server-side Admin API client.
//
// This is the SAME helper pattern from Section 03: read secrets from config,
// build the myshopify.com URL, send the X-Shopify-Access-Token header, check
// res.ok. The access token lives ONLY here on the server — it is never sent
// to the browser (Section 01: the browser talks to our server; our server
// talks to Shopify).

const { config } = require("./config");

// Low-level REST call. `path` is like "products.json" or "draft_orders/5001.json".
async function rest(path, { method = "GET", body } = {}) {
  const url = `https://${config.shop}/admin/api/${config.apiVersion}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-Shopify-Access-Token": config.token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    // Bubble up a useful error for the API layer to translate into JSON.
    const err = new Error(
      `Shopify ${method} ${path} failed: ${res.status} ${res.statusText}`
    );
    err.status = res.status;
    err.shopifyBody = data;
    throw err;
  }
  return data;
}

module.exports = { rest };
