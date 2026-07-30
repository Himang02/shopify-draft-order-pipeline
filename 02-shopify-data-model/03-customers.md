# Customers

The [map](01-the-shopify-data-model.md) put the **Customer** on the commerce side — the buyer who meets the catalog at a sale. Customers are simpler than variants, but have a few sharp edges around *identity* and *what a customer is not*.

---

## Business Problem

Alice calls: "Two Large Classic Tiramisus, delivered Friday." To act on this, Himang needs to record *who Alice is*:

- A **name** for the order and invoice.
- An **email** for the invoice and receipt.
- A **shipping address** for delivery.
- A way to recognize Alice *next time* — her details and history ready.

That bundle is the **Customer** object. And because Himang runs a Shopify store (not a marketplace stall), he *owns* it ([Section 01, Ch. 02](../01-introduction/02-shopify-vs-amazon.md)) — Alice's email and history belong to the store.

---

## Mental Model

> A **Customer** is a store's record of a person who can buy from it — identity, contact details, addresses, and order history.

Two clarifications up front:

1. **A customer record is not a login account.** You can create a Customer (name, email, address) without Alice ever setting a password. It's just data the merchant holds. (A storefront account can be layered on, but it's separate and optional.)
2. **A customer is scoped to one store.** "Alice" on Himang's store is a separate record from "Alice" anywhere else — the same multi-tenancy rule as everything ([Section 01, Ch. 03](../01-introduction/03-merchants-stores-and-the-admin.md)).

Analogy: a Customer is a contact card in the merchant's address book. Having someone's card doesn't give them a key to your house (a login).

---

## Identity: email is the natural key

> **Within a store, a customer's email is their identity.** Shopify uses it to prevent duplicate customers.

Try to create a second customer with an existing email and Shopify objects — this stops the store filling with half-complete "Alice" records.

The distinction that trips people up:

- **email** — the *natural key* (human-meaningful, what Shopify dedupes on).
- **`id`** (e.g. `7001`) — the *technical key* (guaranteed-unique, permanent; unchanged even if Alice updates her email).

**Rule of thumb:** look people up by email; store the `id` as your foreign key, because the email can change.

---

## Anatomy of a Customer

```
   CUSTOMER  (id: 7001)
   ├─ Identity
   │    email:        alice@example.com     ← natural key, dedup target
   │    first_name:   Alice
   │    last_name:    Sharma
   │    phone:        +91-...
   ├─ Addresses
   │    addresses[]:  many addresses (home, office, ...)
   │    default_address: the one used unless told otherwise
   ├─ Relationship / history  (read-only, maintained by Shopify)
   │    orders_count:  4
   │    total_spent:   "2200.00"
   ├─ Marketing
   │    email_marketing_consent:  subscribed / not
   └─ Organization
        tags:         ["vip", "wholesale"]   ← merchant's own labels
```

- **Many addresses, one `default_address`** (home, office). Each order picks one; the default is used when none is specified.
- **Order history is read-only**, maintained by Shopify (`orders_count`, `total_spent`). You read it, never write it.
- **Marketing consent is a real, legal field.** It matters practically (owned audience) and legally (GDPR-style rules). Don't email customers who haven't consented.

---

## Architecture

The customer exists to be attached to orders.

```
        ┌──────────────┐
        │   CUSTOMER    │  (id: 7001, alice@example.com)
        └──────────────┘
               │ places (one customer → many orders)
      ┌────────┴────────────────────────┐
      ▼                                  ▼
┌──────────────┐                  ┌──────────────┐
│ DRAFT ORDER   │  ── becomes ──► │    ORDER      │
│ for Alice     │                 │ for Alice     │
└──────────────┘                  └──────────────┘
      │ uses one of                     │
      ▼                                  ▼
   Alice's addresses               Alice's addresses
```

Attaching Alice's record lets Shopify address the invoice, pre-fill shipping, and file the resulting order under her history. **The customer is the "who" of an order.**

---

## Must every order have a customer?

No. Shoppers can check out as **guests** — an email and address for one purchase, no saved Customer required. So an order can exist with loose contact details and no linked Customer.

But the **draft-order / phone-order flow is different.** When Himang creates a draft for Alice, you usually attach a real Customer — to invoice her, build her history, re-market later.

- **Shopper-driven checkout:** customer optional (guest is normal).
- **Merchant-driven draft order:** you usually attach one on purpose.

---

## REST Implementation

Authentication is [Section 03](../03-rest-api/); we're reading shapes. Fetching Alice:

```
GET /admin/api/2024-10/customers/{customer_id}.json
```

```json
{
  "customer": {
    "id": 7001,
    "email": "alice@example.com",
    "first_name": "Alice",
    "last_name": "Sharma",
    "state": "enabled",
    "orders_count": 4,
    "total_spent": "2200.00",
    "default_address": {
      "id": 88001, "address1": "12 Bakers Lane", "city": "Pune",
      "province": "Maharashtra", "country": "India", "zip": "411001"
    },
    "addresses": [ { "id": 88001, "address1": "12 Bakers Lane", "city": "Pune", "default": true } ],
    "email_marketing_consent": { "state": "subscribed", "opt_in_level": "single_opt_in" }
  }
}
```

- **`id`** is the stable handle; **`email`** the natural key.
- **`orders_count` / `total_spent`** are read-only history you never write.
- **`addresses`** is an array with a `default_address`.
- **`state`** is the *account* status (`disabled`/`invited`/`enabled`/`declined`) — the optional login layer, not whether the record exists. A new record is typically `disabled` (no login), which is normal.
- **`email_marketing_consent`** — whether you may market to Alice. Respect it.

Create with `POST /customers.json` (at least an email). Full walk-through in [Section 03](../03-rest-api/).

---

## GraphQL Implementation

Same object as a GraphQL type (full treatment in [Section 05](../05-graphql/)):

```graphql
query {
  customer(id: "gid://shopify/Customer/7001") {
    email firstName lastName
    numberOfOrders
    amountSpent { amount currencyCode }
    defaultAddress { address1 city country zip }
    emailMarketingConsent { marketingState }
  }
}
```

Same two GraphQL traits: **global ID** (`gid://shopify/Customer/7001`), and richer field types — `amountSpent` is a money object `{ amount, currencyCode }` rather than REST's flat string. Same data, more explicit shape.

---

## Production Considerations

- **Key off the `id`, dedupe by email.** Storing email as your foreign key breaks the day Alice changes it.
- **Handle "email already exists" gracefully** — a **find-or-create** flow: look up by email first, create only if absent.
- **Treat marketing consent as sacred** — never email non-opted-in customers. Best practice *and* legal requirement.
- **Customers are per-store.** Across several stores, each "Alice" is distinct. No global identity.
- **Personal data means privacy obligations** (GDPR/CCPA — retention, deletion). Shopify sends data-request/redaction webhooks for this ([Section 04](../04-webhooks/), [Section 10](../10-production/)).

---

## Common Misconceptions

**❌ "Every order has a customer record."**
Guest checkout lets an order exist with just contact details. Attaching a customer is common in the draft-order flow, not universal.

**❌ "Creating a customer creates a login account."**
A Customer is a *data record*, independent of any storefront login (which is a separate, optional layer — the `state` field).

**❌ "The email is just a contact field."**
It's the customer's *identity* within the store — Shopify dedupes on it.

**❌ "A customer is shared across all Shopify stores."**
Per-store, like all data. Alice here ≠ Alice elsewhere.

**❌ "I should store and maintain `total_spent`/`orders_count` myself."**
Shopify computes them. Read them; don't own them.

---

## Frequently Asked Questions

**Q: Can I create a customer with just an email?**
Yes — email is the only required field. But add name + address so invoices and delivery work.

**Q: What if the email already exists?**
Shopify won't create a duplicate — the call fails or returns the existing one. Use find-by-email, then create only if not found.

**Q: Record vs. account?**
The record is the data the merchant holds. The account is an optional storefront login. You can have a record with no account (the default via API).

**Q: Does a draft order require a customer?**
Not strictly, but in the phone-order flow you almost always attach one — the point is to invoice a specific person ([Section 03](../03-rest-api/)).

**Q: Why do addresses have their own IDs?**
So an order can reference a specific one (shipping vs. billing) out of the several a customer may have.

---

## Interview Questions

1. What is a Customer, in one sentence?
2. What does Shopify treat as a customer's identity, and what does it prevent?
3. Which key should your database use — email or `id` — and why?
4. Is a customer record the same as a login account? Explain.
5. Must every order have a customer? When is one attached?
6. Which customer fields are read-only?
7. Why is `email_marketing_consent` more than a convenience field?

---

## Summary

- A **Customer** is a store's owned buyer record: identity, addresses, history, consent.
- **Email is the natural key** (dedupe target); the **`id`** is the stable key (store it).
- A **record ≠ a login account** (the account is an optional `state` layer).
- Customers are **per-store**, have **many addresses** (one default), and **read-only order history**.
- **Not every order needs a customer** (guest checkout), but the **draft-order flow usually attaches one**.
- **Marketing consent** is both an asset and a legal obligation.

---

## What's Next

You now have both ingredients of a sale — **what** (variants) and **who** (customer).

→ **Next: [Draft Orders](04-draft-orders.md)** — the object this repo is named for. Combine a customer and variants into a quotation Himang sends Alice before she's paid.
