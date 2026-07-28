// verify-auth.js — confirm our Admin API access token works.
//
// Introduced in: 03-rest-api/01-authentication-and-access-tokens.md
//
// Usage:
//   export SHOPIFY_STORE="himangs-tiramisu.myshopify.com"
//   export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxx"
//   node verify-auth.js
//
// Requires Node.js 18+ (uses the built-in global fetch).

const SHOP = process.env.SHOPIFY_STORE; // himangs-tiramisu.myshopify.com
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // shpat_...
const API_VERSION = "2024-10"; // always pin the version explicitly

async function main() {
  if (!SHOP || !TOKEN) {
    throw new Error("Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN env vars.");
  }

  const url = `https://${SHOP}/admin/api/${API_VERSION}/shop.json`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": TOKEN, // <-- the authentication
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    // 401 = bad/missing token, 403 = token lacks the required scope
    const body = await res.text();
    throw new Error(`Request failed: ${res.status} ${res.statusText}\n${body}`);
  }

  const data = await res.json();
  console.log("Authenticated. Store:", data.shop.name, "|", data.shop.currency);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
