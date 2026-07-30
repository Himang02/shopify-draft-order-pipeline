# Merchants, Stores, and the Admin

This chapter defines the three words you'll use constantly: **merchant**, **store**, and the **admin**. "Store" in particular has a precise technical meaning that makes API authentication and multi-tenancy click.

---

## Business Problem

Himang signs up on `shopify.com` and has a working store in minutes. Immediately, some practical questions:

- What *is* this store, technically? Where does it live?
- His address is `himangs-tiramisu.com`, but setup also showed `himangs-tiramisu.myshopify.com`. Why two?
- He wants an assistant who can add products but not see revenue. How?
- When your server makes an API call, how does Shopify know it's for *his* store, not one of millions?

This is the vocabulary you need before the first API call.

---

## Mental Model

- **Merchant** — the person or business that owns and runs a store. Himang is the merchant. (The merchant is the business identity, not necessarily one human — see staff below.)
- **Store** — the single Shopify **tenant**: one isolated container of this business's products, customers, orders, settings, and theme. "Store" and "shop" are the same thing; the API calls it `shop`.
- **The Admin** — the dashboard the merchant logs into to run the store: add products, view orders, issue refunds, change settings.

> A **merchant** runs a **store** through the **admin**.

In the mall analogy: the merchant is the shop owner, the store is the rented unit (with all its stock and records), and the admin is the back office.

---

## What a "store" actually is

When Himang signs up, Shopify provisions a **tenant** — an isolated slice of infrastructure for this one business, walled off from every other store. This is Chapter 01's multi-tenancy made concrete: one store = one tenant.

Every store gets a permanent, unique address the moment it's created:

```
himangs-tiramisu.myshopify.com
```

This `*.myshopify.com` domain is the store's **true identity**:

- **Assigned by Shopify and permanent** — never changes for the store's life.
- **Globally unique** — how Shopify tells tenants apart.
- **What your API calls are addressed to** — every request goes to `https://himangs-tiramisu.myshopify.com/admin/api/...`. The domain in that URL routes the call to the right tenant.

So "every request must name which store" (Chapter 01) works because the `myshopify.com` domain **is** the store's name.

### Then what's `himangs-tiramisu.com`?

A **custom domain** — the branded public address Himang buys and points at the store, so shoppers see a nice URL instead of a `myshopify.com` one.

```
        SHOPPERS SEE                    SHOPIFY / YOUR CODE USE
   himangs-tiramisu.com      ───►      himangs-tiramisu.myshopify.com
   (custom domain, branded)            (permanent tenant identity)
```

Two addresses, one store. The custom domain can change or be dropped; the `myshopify.com` identity is forever — which is why the plumbing keys off it.

> **Rule of thumb:** shoppers use the custom domain; your API code uses the `myshopify.com` domain.

---

## Architecture

```
        Himang (merchant)
              │ logs into
              ▼
     ┌──────────────────────┐
     │    Shopify Admin      │   the dashboard (admin.shopify.com)
     │  add products, view   │
     │  orders, settings...  │
     └──────────────────────┘
              │ reads/writes
              ▼
     ┌───────────────────────────────────────────┐
     │   THE STORE  (one tenant)                   │
     │   id: himangs-tiramisu.myshopify.com        │
     │   ├─ products, variants                     │
     │   ├─ customers                              │
     │   ├─ orders, draft orders                   │
     │   ├─ settings, staff, theme                 │
     │   └─ custom domain: himangs-tiramisu.com    │
     └───────────────────────────────────────────┘
              ▲
              │ addressed by the myshopify.com domain
              │
     ┌──────────────────────┐
     │     Your Server       │   API calls target the same store
     └──────────────────────┘
```

The admin and your server both point at the *same store* — Chapter 01's two-doors idea, with the store as the shared thing in the middle.

---

## Internal Working: what the merchant does in the admin

What lives in the admin also tells you what the *API* can touch (two doors, same data):

- **Products** — set prices, photos, inventory.
- **Orders** — see sales, mark fulfilled, refund. Draft orders live here too.
- **Customers** — the owned customer list.
- **Settings** — payments, shipping, taxes, custom domain.
- **Staff** — who can log in and what they can do.
- **Apps** — installed add-ons (eventually including yours).

### Staff accounts and permissions

Himang's "assistant who can't see revenue" is a **staff account**: an extra login under the same store, granted a subset of **permissions** (e.g. "manage products" but not "view finances").

This matters for one reason: **an app's API access is permission-scoped too.** When your code connects, it's granted specific **scopes** — `read_products`, `write_draft_orders` — exactly like a staff member. Detailed in [Section 09](../09-authentication/).

---

## REST & GraphQL

Is a "store" an object you fetch? Mostly it's the *context* of every call, but its details are exposed:

- **REST:** `GET /admin/api/2024-10/shop.json` returns name, domain, currency, timezone, plan. The object is called **`shop`**.
- **GraphQL:** the top-level `shop` field — `{ shop { name myshopifyDomain currencyCode } }`.

Authentication comes first ([Section 03](../03-rest-api/), [Section 09](../09-authentication/)). The point: **the store is addressed by its `myshopify.com` domain and represented as the `shop` object.**

---

## Production Considerations

- **Key integrations off the `myshopify.com` domain, never the custom domain** — the custom one can change; the `myshopify.com` one can't. Store it as your "which store is this" key.
- **One access token belongs to one store.** Credentials are per-tenant; an app on Himang's store can't touch another store.
- **Respect scopes.** Request only what you need (e.g. `read_products`, `write_draft_orders`). Over-broad access is a liability. ([Section 09](../09-authentication/).)
- **Admin and API stay in sync automatically** — same data underneath. Don't build reconciliation assuming they diverge.

---

## Common Misconceptions

**❌ "The `myshopify.com` address is temporary; I replace it with my real domain."**
It's permanent. The custom domain is *added on top* as a public alias; machines keep using the `myshopify.com` identity forever.

**❌ "A store and a merchant are the same."**
A merchant is the owner; a store is the tenant they run. One merchant can run multiple stores — separate tenants, separate data.

**❌ "The admin is a separate system from the API; data could drift."**
Two interfaces to one store. A change through either shows in the other immediately.

**❌ "Anyone with a login can do anything."**
Staff accounts are permission-scoped; the same principle scopes what an app can do.

---

## Frequently Asked Questions

**Q: Why two web addresses?**
`myshopify.com` is the permanent, unique technical identity used by the API. The `.com` custom domain is what shoppers see. Two addresses, one store.

**Q: Is "store" the same as "shop"?**
Yes. The API object is named `shop`. This course says "store" in prose, "`shop`" for the API object.

**Q: Can one merchant have multiple stores?**
Yes — each a separate tenant with its own `myshopify.com` domain, data, and credentials.

**Q: How does Shopify know which store my call is for?**
The `myshopify.com` domain in the URL, plus the per-store access token. Together: "this store, and you're allowed." ([Section 09](../09-authentication/).)

**Q: Do I log into the admin as an engineer?**
Maybe, to configure or watch data. But your *code* calls the Admin API directly — the admin is for humans.

---

## Interview Questions

1. Define merchant, store, and admin in one sentence each.
2. What is a store, technically? (Use "tenant.")
3. `myshopify.com` vs. custom domain — which should an integration key off, and why?
4. What's the API object name for a store?
5. How does Shopify know which store an API request is for?
6. How do staff permissions relate to what an app can do?
7. If your code creates a draft order, must you sync it to the admin? Why or why not?

---

## Summary

- A **merchant** runs a **store** through the **admin**.
- A **store is a tenant** — one isolated container of products, customers, orders, settings. Shopify is multi-tenant.
- Every store has a permanent, unique **`myshopify.com` domain** (its true identity, the API target). A **custom domain** is a changeable public alias.
- The API represents a store as the **`shop`** object; mostly it's the *context* of calls.
- **Staff accounts** are permission-scoped, and the same idea scopes what an **app** can do.
- Admin and Admin API are **two doors into one store**; they never drift.

---

## What's Next

→ **[Section 02 — Shopify Data Model](../02-shopify-data-model/).** We open the store and meet the objects inside, starting with the one beginners misunderstand most: **Products vs. Variants**.
