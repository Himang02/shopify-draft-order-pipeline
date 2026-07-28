# Customers over REST

You have variants and their IDs (the "what"). This chapter gets the "who": a **customer** record for Alice, and the ID the draft order will reference. The concept is from [Section 02, Ch. 03](../02-shopify-data-model/03-customers.md) — a store-owned buyer record, identified by email. Here we create and look one up over REST, and confront the one thing that makes customers trickier than products: **email is unique**, so you must *find-or-create*.

---

## Business Problem

Alice calls. To build her draft order you need her as a Customer in Himang's store — with her email and shipping address — so Shopify can invoice her and file the eventual order under her history.

But Alice might already be a customer (she ordered last month). If your code blindly `POST`s a new customer with `alice@example.com`, Shopify rejects it: that email already identifies a customer. So the real task isn't "create a customer" — it's **"get me Alice's customer ID, creating her only if she's new."** That pattern is called **find-or-create**.

---

## Mental Model

> Because **email is the customer's identity** within a store (Section 02, Ch. 03), customer creation is not "always insert" — it's **find-by-email, then insert only if absent**.

Two keys, from the concept chapter, both in play here:

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

That branch — search, then conditionally create — is the whole chapter.

---

## REST Implementation

Same authenticated request pattern as before.

### Search for a customer by email

```
GET /admin/api/2024-10/customers/search.json?query=email:alice@example.com
```

Returns `{ "customers": [ … ] }` — an array that's empty if nobody matches, or has Alice if she exists. The `query` uses Shopify's search syntax; `email:` targets the email field exactly.

### Create a customer

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
      {
        "address1": "12 Bakers Lane",
        "city": "Pune",
        "province": "Maharashtra",
        "country": "India",
        "zip": "411001",
        "default": true
      }
    ]
  }
}
```

- **`email`** is the only strictly required field, but name + address make the invoice and delivery work (Section 02, Ch. 03).
- **`addresses[]`** with `default: true` sets Alice's default shipping address — the one the draft order can auto-use.

The response includes the server-assigned **`id`** (e.g. `7001`) — the value you carry into the draft order.

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

The important bit is `findOrCreateCustomer`: it **searches first** and only creates on a miss — the correct way to handle an identity-by-email object. A copy lives in [`examples/customers.js`](../examples/customers.js).

---

## GraphQL Implementation

The same in GraphQL (Section 05):

- **Find:** the `customers` query with a `query:` argument (`"email:alice@example.com"`) — Shopify's search syntax carries over.
- **Create:** the `customerCreate` mutation, returning the customer and a `userErrors` array. A duplicate email shows up in `userErrors` (business-rule failure) rather than as an HTTP error — the pattern Section 05 dwells on.

Same find-or-create logic; you just read failures from `userErrors` instead of the HTTP status.

---

## Production Considerations

- **Always find-or-create; never blind-insert.** Duplicate-email inserts fail, and worse, sloppy handling can scatter half-formed "Alice" records. Search first.
- **Handle the race.** Two requests can both search, both miss, and both try to create. Handle the create-time duplicate error by re-searching and using the existing record. (Idempotency again — a recurring production theme.)
- **Store the `id`, match on email.** Keep the numeric `id` as your foreign key; use email only to *find*. Emails change; IDs don't (Section 02, Ch. 03).
- **Respect marketing consent and privacy.** Don't flip `email_marketing_consent` without real consent, and remember customer data carries GDPR/CCPA obligations ([Section 04](../04-webhooks/), [Section 10](../10-production/)).
- **Search is eventually consistent.** A just-created customer may take a moment to appear in `customers/search`. If you create then immediately search, prefer using the ID you already got from the create response.

---

## Common Misconceptions

**❌ "I just POST a new customer each time."**
Reality: Email is unique per store. Blind inserts of an existing email fail. Use find-or-create.

**❌ "I should look the customer up by email later, in my own DB."**
Reality: Store the `id` as the key; email is only for finding. If you key on email and Alice changes it, your link breaks.

**❌ "Creating a customer sends them an email / makes an account."**
Reality: Creating a record is silent and is *not* a storefront login account (Section 02, Ch. 03). Invitations/accounts are separate, optional actions.

**❌ "A failed create means something is broken."**
Reality: A duplicate-email failure is expected and meaningful — it's Shopify telling you the customer already exists. Handle it by searching and reusing.

---

## Frequently Asked Questions

**Q: What's the minimum to create a customer?**
An email. But include name and a default address so invoices and delivery work for the draft order.

**Q: Why search first instead of catching the duplicate error?**
Searching is the clean primary path and also gives you the *existing* customer's full record (and ID). Catching the error still requires a follow-up search to get that record, so search-first is simpler. Do handle the error too, for the race case.

**Q: The customer I just created isn't showing up in search — bug?**
Search can lag slightly behind creation (eventual consistency). Use the `id` from the create response directly instead of immediately searching for what you just made.

**Q: Can one customer have several addresses?**
Yes (Section 02, Ch. 03). `addresses[]` holds many; mark one `default: true`. The draft order can pick a specific one.

---

## Interview Questions

1. Why is customer creation a *find-or-create*, unlike product creation?
2. Which field do you search by, and which do you store as the key? Why the difference?
3. What happens if you `POST` a customer with an email that already exists?
4. Describe the race condition in find-or-create and how you'd handle it.
5. Does creating a customer record create a storefront login? Explain.
6. Why might a just-created customer not appear immediately in search?

---

## Summary

- Getting Alice into the store is a **find-or-create**: `GET /customers/search.json?query=email:…`, then `POST /customers.json` only if the search is empty — because **email is a unique identity** (Section 02, Ch. 03).
- Create with at least an **email**, ideally **name + a default address**, so invoicing and delivery work. The response gives the **`id`** you carry into the draft order.
- **Store the `id`, match on email**; handle the **duplicate-email** result and the **create race** idempotently; remember **search is eventually consistent**.
- GraphQL mirrors this with the `customers` query and `customerCreate` mutation, reporting duplicates via `userErrors` (Section 05).

---

## What's Next

You now have both halves a sale needs — **variant IDs** and a **customer ID**. Time to combine them into the object this whole repository is about.

→ **Next chapter: [Creating a Draft Order](04-creating-a-draft-order.md)** — assemble Alice's customer and the tiramisu variants into an open draft order, and watch Shopify compute the totals.
