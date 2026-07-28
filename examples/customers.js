// customers.js — find a customer by email, or create if absent (find-or-create).
//
// Introduced in: 03-rest-api/03-customers-over-rest.md
//
// Usage:
//   export SHOPIFY_STORE="himangs-tiramisu.myshopify.com"
//   export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxx"
//   node customers.js
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

async function findCustomerByEmail(email) {
  const q = encodeURIComponent(`email:${email}`);
  const { customers } = await shopify(`customers/search.json?query=${q}`);
  return customers[0] || null; // null if nobody matches
}

async function createCustomer({ email, firstName, lastName, address }) {
  const { customer } = await shopify("customers.json", {
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
  return customer;
}

// The find-or-create pattern: never blindly POST a duplicate email.
async function findOrCreateCustomer(details) {
  const existing = await findCustomerByEmail(details.email);
  if (existing) {
    console.log(`Found existing customer ${existing.id} (${existing.email})`);
    return existing;
  }
  const created = await createCustomer(details);
  console.log(`Created customer ${created.id} (${created.email})`);
  return created;
}

async function main() {
  if (!SHOP || !TOKEN) throw new Error("Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN.");
  const alice = await findOrCreateCustomer({
    email: "alice@example.com",
    firstName: "Alice",
    lastName: "Sharma",
    address: {
      address1: "12 Bakers Lane",
      city: "Pune",
      province: "Maharashtra",
      country: "India",
      zip: "411001",
    },
  });
  console.log("Use this customer id in the draft order:", alice.id);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
