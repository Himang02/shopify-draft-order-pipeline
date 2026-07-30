# Customers over REST

You have the "what" (variant IDs). Now the "who": a **customer** record for Alice, and the ID the draft order references. The concept is from [Section 02, Ch. 03](../02-shopify-data-model/03-customers.md). The thing that makes customers trickier than products: **email is unique**, so you must *find-or-create*.

---

## Business Problem

To build Alice's draft order you need her as a Customer — email and shipping address — so Shopify can invoice her and file the order under her history.

But she might already exist. Blindly `POST`ing `alice@example.com` fails: that email already identifies a customer. So the task isn't "create a customer" — it's **"get Alice's customer ID, creating her only if new."** That's **find-or-create**.

---

## Mental Model

> Because **email is the customer's identity** in a store, creation isn't "always insert" — it's **find-by-email, then insert only if absent**.

Two keys:

- **email** — the natural key you *search* by.
- **`id`** — the stable handle you *keep* and hand to the draft order.

---

## Architecture

```
   need Alice's customer id
          │
          ▼
   GET /customers/search.json?query=email:alice@example.com
          │
     found? ──yes──►  use existing customer.id
          │
          no
          ▼
   POST /customers.json  (email + name + address)
          │
          ▼
     use new customer.id
```

Search, then conditionally create — that's the whole chapter.

---

## REST Implementation

### Search by email

```
GET /admin/api/2024-10/customers/search.json?query=email:alice@example.com
```

Returns `{ "customers": [ … ] }` — empty if nobody matches. `email:` targets the email field in Shopify's search syntax.

### Create

```
POST /admin/api/2024-10/customers.json
```

```json
{
  "customer": {
    "email": "alice@example.com",
    "first_name": "Alice",
    "last_name": "Sharma",
    "addresses": [
      { "address1": "12 Bakers Lane", "city": "Pune", "province": "Maharashtra", "country": "India", "zip": "411001", "default": true }
    ]
  }
}
```

- **`email`** is the only required field; name + address make the invoice and delivery work.
- **`addresses[]`** with `default: true` sets the default the draft order can auto-use.

The response gives the server-assigned **`id`** (e.g. `7001`) — carried into the draft order.

### Runnable find-or-create

```javascript
// customers.js — find a customer by email, or create if absent (find-or-create).
// Introduced in: 03-rest-api/03-customers-over-rest.md
// Node 18+.  Env: SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN

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
```

`findOrCreateCustomer` **searches first**, creating only on a miss — the right way to handle an identity-by-email object. Copy in [`examples/customers.js`](../examples/customers.js).

---

## GraphQL Implementation

Same in GraphQL (Section 05):

- **Find:** the `customers` query with a `query:` argument (`"email:alice@example.com"`).
- **Create:** the `customerCreate` mutation. A duplicate email shows up in **`userErrors`**, not as an HTTP error.

Same find-or-create logic; you read failures from `userErrors` instead of the HTTP status.

---

## Production Considerations

- **Always find-or-create; never blind-insert** — duplicate-email inserts fail and sloppy handling scatters half-formed records.
- **Handle the race** — two requests can both miss and both try to create. On the create-time duplicate error, re-search and use the existing record.
- **Store the `id`, match on email** — emails change, IDs don't.
- **Respect consent and privacy** — don't flip `email_marketing_consent` without consent; customer data carries GDPR/CCPA obligations.
- **Search is eventually consistent** — a just-created customer may lag in `customers/search`; use the `id` from the create response instead.

---

## Common Misconceptions

**❌ "I just POST a new customer each time."**
Email is unique — blind inserts of an existing email fail. Use find-or-create.

**❌ "I'll look the customer up by email in my own DB."**
Store the `id` as the key; email is only for finding. Keying on email breaks when Alice changes it.

**❌ "Creating a customer emails them / makes an account."**
Creating a record is silent and is *not* a storefront login. Accounts are separate, optional.

**❌ "A failed create means something's broken."**
A duplicate-email failure is expected — Shopify telling you the customer exists. Search and reuse.

---

## Frequently Asked Questions

**Q: Minimum to create a customer?**
An email. But include name + a default address so invoices and delivery work.

**Q: Why search first instead of catching the duplicate error?**
Searching is the clean primary path and gives you the existing record + ID. Still handle the error too, for the race.

**Q: My just-created customer isn't in search — bug?**
Search lags creation (eventual consistency). Use the `id` from the create response.

**Q: Can one customer have several addresses?**
Yes — `addresses[]` holds many; mark one `default: true`.

---

## Interview Questions

1. Why is customer creation a find-or-create, unlike products?
2. Which field do you search by, which do you store, and why?
3. What happens if you `POST` an existing email?
4. Describe the find-or-create race and how you'd handle it.
5. Does creating a record create a login? Explain.
6. Why might a just-created customer not appear in search?

---

## Summary

- Getting Alice in is a **find-or-create**: search by email, `POST` only if empty — because **email is a unique identity**.
- Create with at least an **email** (ideally name + default address); the response gives the **`id`** you carry forward.
- **Store the `id`, match on email**; handle **duplicate-email** and the **create race** idempotently; **search is eventually consistent**.
- GraphQL mirrors this with `customers` + `customerCreate`, reporting duplicates via `userErrors`.

---

## What's Next

You have both halves — **variant IDs** and a **customer ID**.

→ **Next: [Creating a Draft Order](04-creating-a-draft-order.md)** — combine them into an open draft order and watch Shopify compute the totals.
