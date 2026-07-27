# Customers

The [data-model map](01-the-shopify-data-model.md) put the **Customer** on the commerce side, as the buyer who meets the catalog at the moment of a sale. This chapter zooms in. Customers are a simpler object than variants, but there are a few sharp edges — especially around *identity* and *what a customer is not* — that matter the moment you start creating draft orders.

---

## Business Problem

Alice calls Himang: "Two Large Classic Tiramisus, please, delivered to my flat on Friday."

To act on this, Himang needs to record *who Alice is*:

- A **name**, to address the order and the invoice.
- An **email**, to send the invoice and the receipt.
- A **shipping address**, to deliver the tiramisu.
- Ideally, a way to recognize Alice *next time* she calls — so her details and history are already there.

That bundle of facts about a buyer is the **Customer** object. And recall the payoff from [Section 01, Chapter 02](../01-introduction/02-shopify-vs-amazon.md): because Himang runs a Shopify store (not a marketplace stall), Himang *owns* this record. Alice's email and history belong to the store. The Customer object is where that owned relationship physically lives.

---

## Mental Model

> A **Customer** is a store's record of a person who can buy from it — their identity, contact details, addresses, and order history.

Two clarifications that prevent most confusion, stated up front:

1. **A customer record is not a login account.** You can create a Customer for Alice — name, email, address — without Alice ever setting a password or logging into the storefront. The record is just data the *merchant* holds. (Alice *can* optionally have a storefront account layered on top, but that's separate and optional. More below.)
2. **A customer is scoped to one store.** "Alice" on Himang's store is a completely separate record from "Alice" on any other Shopify store. There is no global Shopify customer shared across stores — same multi-tenancy rule as everything else ([Section 01, Chapter 03](../01-introduction/03-merchants-stores-and-the-admin.md)).

Analogy: a Customer is like a contact card in the merchant's own address book. Having someone's contact card doesn't mean they have a key to your house (a login) — it just means you have their details on file.

---

## Identity: email is the natural key

The single most useful fact about customers:

> **Within a store, a customer's email is treated as their identity.** Shopify uses it to avoid creating duplicate customers.

If Himang already has a customer `alice@example.com` and you try to create another customer with that same email in the same store, Shopify will object — it recognizes the email as already belonging to a customer. This is deliberate: it stops the store from ending up with three half-complete "Alice" records.

But note the distinction that trips people up:

- The **email** is the *natural key* — the human-meaningful identity, and what Shopify dedupes on.
- The **`id`** (e.g. `7001`) is the *technical key* — Shopify's guaranteed-unique, permanent handle. It never changes even if Alice updates her email.

**Rule of thumb:** dedupe and look people up by email; but store the `id` as the foreign key in your own database, because it's stable and the email can change.

---

## Anatomy of a Customer

The fields that matter, grouped by purpose:

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

Three things worth calling out:

- **A customer has *many* addresses, with one `default_address`.** Alice might have a home and an office. Each order picks an address; the default is used when none is specified. Addresses are their own little sub-objects (street, city, province, country, zip).
- **Order history is read-only and Shopify-maintained.** `orders_count` and `total_spent` are computed by Shopify as orders come in. You don't set them; you read them. (This echoes the map's "who creates it" idea — the *relationship* is maintained by the platform.)
- **Marketing consent is a real, legal field.** Whether Alice agreed to marketing emails is recorded here. It matters both practically (the owned-audience asset) and legally (privacy laws like GDPR govern re-marketing). Don't email customers who haven't consented.

---

## Architecture: how a customer connects

The customer's whole reason to exist in the model is to be attached to orders.

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
   (shipping / billing)            (shipping / billing)
```

When you build a draft order in [Section 03](../03-rest-api/), attaching Alice's customer record is what lets Shopify address the invoice, pre-fill the shipping address, and — once it becomes an order — file that order under Alice's history. **The customer is the "who" of an order.**

---

## Must every order have a customer?

No — and this is a common misconception, so it's worth its own beat.

Shoppers can check out as **guests**: they enter an email and shipping address for that one purchase without a saved customer record being required. So an order can exist with only loose contact details and no linked Customer object.

But the **draft-order / phone-order flow this repository is about is different.** When *Himang* creates a draft order for Alice, you typically attach a real Customer, precisely because the merchant wants the record: to invoice her, to build her history, to re-market later. So:

- **Shopper-driven checkout:** customer is optional (guest checkout is normal).
- **Merchant-driven draft order:** you usually attach a customer on purpose.

The object model allows both; which you use depends on who's driving the sale.

---

## REST Implementation

Authentication is [Section 03](../03-rest-api/), so we're reading shapes, not running calls. Fetching Alice:

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
    "phone": "+91-9000000000",
    "verified_email": true,
    "state": "enabled",
    "orders_count": 4,
    "total_spent": "2200.00",
    "tags": "vip",
    "default_address": {
      "id": 88001,
      "address1": "12 Bakers Lane",
      "city": "Pune",
      "province": "Maharashtra",
      "country": "India",
      "zip": "411001"
    },
    "addresses": [
      { "id": 88001, "address1": "12 Bakers Lane", "city": "Pune", "default": true }
    ],
    "email_marketing_consent": {
      "state": "subscribed",
      "opt_in_level": "single_opt_in"
    }
  }
}
```

Reading it against what we just covered:

- **`id: 7001`** is the stable handle; **`email`** is the natural key Shopify dedupes on.
- **`orders_count` and `total_spent`** are the read-only history Shopify maintains — you'll never write these.
- **`addresses` is an array** with a `default_address` singled out.
- **`state`** describes the *account* status (`disabled`, `invited`, `enabled`, `declined`) — this is the optional storefront-login layer, not whether the record exists. A brand-new record you create is typically `disabled` (a record with no login), which is perfectly normal.
- **`email_marketing_consent`** captures whether you may market to Alice. Respect it.

To create Alice, you'd `POST /customers.json` with at least an email (and usually name + address). Full walk-through in [Section 03](../03-rest-api/).

---

## GraphQL Implementation

The same object as a GraphQL type (full treatment in [Section 05](../05-graphql/)):

```graphql
query {
  customer(id: "gid://shopify/Customer/7001") {
    email
    firstName
    lastName
    numberOfOrders
    amountSpent { amount currencyCode }
    defaultAddress { address1 city country zip }
    emailMarketingConsent { marketingState }
  }
}
```

Notice the same two GraphQL traits from the last chapter:

- **Global ID:** `gid://shopify/Customer/7001` instead of the bare `7001`.
- **Naming differs slightly:** GraphQL prefers `camelCase` and richer field types — e.g. `amountSpent` is a *money object* (`{ amount, currencyCode }`) rather than REST's bare string `"2200.00"`. Same data, more explicit shape.

The concept is unchanged: an identity, addresses, history, and consent.

---

## Production Considerations

- **Key your database off the customer `id`, dedupe by email.** The `id` is stable; the email is how you match "is this the same Alice." Storing the email as your foreign key breaks the day Alice changes it.
- **Handle the "email already exists" case gracefully.** When creating customers from your own system, expect Shopify to reject a duplicate email. Design a find-or-create flow: look up by email first, create only if absent.
- **Treat marketing consent as sacred.** Never email customers who haven't opted in. It's both an owned-audience best practice and a legal requirement in many jurisdictions.
- **Remember customers are per-store.** If you integrate several stores, "Alice" in each is a distinct record. Don't build logic assuming a global customer identity across stores.
- **Personal data means privacy obligations.** Names, emails, and addresses are personal data. Storing copies in your own system brings GDPR/CCPA-style responsibilities (retention, deletion requests). Shopify even sends *data-request* and *redaction* webhooks for this — noted here, detailed in [Section 04](../04-webhooks/) and [Section 10](../10-production/).

---

## Common Misconceptions

**❌ "Every order has a customer record."**
Reality: Guest checkout lets an order exist with just contact details and no linked Customer. Attaching a customer is common in the merchant-driven draft-order flow, but it's not universal.

**❌ "Creating a customer means creating a login account with a password."**
Reality: A Customer is a *data record* the merchant holds. It exists independently of any storefront login. The optional account/login is a separate layer (reflected in the `state` field).

**❌ "The email is just a contact field."**
Reality: The email is the customer's *identity* within the store — Shopify dedupes on it. It's contact info *and* the natural key.

**❌ "A customer is shared across all Shopify stores."**
Reality: Customers are per-store tenants of data, like everything else. Alice on Himang's store ≠ Alice on another store.

**❌ "I should store `total_spent` / `orders_count` myself and keep them updated."**
Reality: Shopify computes and maintains these. Read them; don't try to own them.

---

## Frequently Asked Questions

**Q: Can I create a customer with just an email?**
Yes — email is the only truly required field. But for a real order you'll usually want a name and a shipping address too, so the invoice and delivery work.

**Q: What happens if I create a customer whose email already exists in the store?**
Shopify treats the email as the identity and won't create a duplicate — the call fails or returns the existing customer, depending on how you call it. The right pattern is find-by-email, then create only if not found.

**Q: What's the difference between a customer *record* and a customer *account*?**
The record is the data (name, email, address, history) the merchant holds. The account is an optional storefront login that lets the customer sign in, see their orders, and check out faster. You can have a record with no account — that's the default when you create one via the API.

**Q: Does a draft order require a customer?**
Not strictly, but in the phone-order flow you almost always attach one, because the whole point is to record and invoice a specific person. We'll do exactly this in [Section 03](../03-rest-api/).

**Q: Why do addresses have their own IDs?**
Because a customer can have several, and orders reference a specific one (shipping vs. billing). Giving each address an `id` lets an order point at exactly the address used.

---

## Interview Questions

1. What is a Customer object, in one sentence?
2. What field does Shopify treat as a customer's identity within a store, and what does that prevent?
3. Which key should your own database use as the foreign key for a customer — email or `id` — and why?
4. Is a customer record the same as a storefront login account? Explain.
5. Must every order have a linked customer? When is one typically attached?
6. Which customer fields are read-only, maintained by Shopify?
7. Why is `email_marketing_consent` more than a convenience field?

---

## Summary

- A **Customer** is a store's owned record of a buyer: identity, contact details, addresses, order history, and marketing consent.
- **Email is the natural key** Shopify dedupes on; the **`id`** is the stable technical key. Look up by email, store the `id`.
- A customer **record ≠ a login account**; the record is just data, and the storefront account is an optional layer (`state` field).
- Customers are **per-store**, like all Shopify data.
- A customer has **many addresses** (one default), and its **order history is read-only**, maintained by Shopify.
- **Not every order needs a customer** (guest checkout), but the merchant-driven **draft-order flow usually attaches one** — the customer is the "who" of an order.
- **Marketing consent** is both the owned-audience asset and a legal obligation; respect it, and treat all customer data with privacy care.

---

## What's Next

You now have the two ingredients a sale needs: **what** is being bought (variants) and **who** is buying (customer).

→ **Next chapter: [Draft Orders](04-draft-orders.md)** — the object this entire repository is named for. We combine a customer and some variants into a *quotation* that Himang can send to Alice before she's paid a rupee.
