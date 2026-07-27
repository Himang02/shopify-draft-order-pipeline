# Merchants, Stores, and the Admin

You now know *what* Shopify is (infrastructure for running a store you own) and *how* it differs from a marketplace. This chapter nails down the three words you'll use in every sentence for the rest of the course: **merchant**, **store**, and the **admin**. They sound obvious. But "store" in particular has a precise technical meaning that, once you see it, makes API authentication and multi-tenancy click.

---

## Business Problem

Himang signs up on `shopify.com`, and within minutes there's a working store. But some very practical questions appear immediately:

- What *is* this store, technically? Where does it live?
- Himang's address is `himangs-tiramisu.com`, yet the setup screen also showed a `himangs-tiramisu.myshopify.com` address. Why two?
- Himang wants an assistant to add products but *not* see revenue. How?
- When your server later makes an API call, how does Shopify know it's for *Himang's* store and not one of the millions of others?

These aren't advanced topics. They're the vocabulary you need before the first API call — so let's ground each term.

---

## Mental Model

Three words, three plain meanings:

- **Merchant** — the *person or business that owns and runs a store*. Himang is the merchant. (Sometimes there are several people; more on that under "staff" below. The merchant is the business identity, not necessarily one human.)
- **Store** — the *single Shopify tenant*: one isolated container holding this business's products, customers, orders, settings, and theme. Himang's Tiramisu is one store. "Store" and "shop" mean the same thing in Shopify; the API even calls it `shop`.
- **The Admin** — the *dashboard the merchant logs into* to run the store: add products, view orders, issue refunds, change settings. It's the human control panel over the store's data.

The relationship in one line:

> A **merchant** runs a **store** through the **admin**.

Back to the mall analogy: the merchant is the shop owner, the store is the rented shop unit (with all its stock and records inside), and the admin is the back office where the owner does paperwork.

---

## What a "store" actually is under the hood

This is the part worth slowing down for, because "store" is more precise than it looks.

When Himang signs up, Shopify provisions a new **tenant** — an isolated slice of Shopify's infrastructure dedicated to this one business. Everything about Himang's Tiramisu lives inside that tenant, walled off from every other store. This is the *multi-tenancy* from Chapter 01, made concrete: one store = one tenant.

Every store gets a permanent, unique technical address the moment it's created:

```
himangs-tiramisu.myshopify.com
```

This `*.myshopify.com` domain is the store's **true identity**. Notice its traits:

- It's **assigned by Shopify** and **permanent** — it never changes for the life of the store.
- It's **globally unique** — no two stores share one. It's how Shopify tells tenants apart.
- It's what your **API calls are addressed to**. Later, every request your server makes will go to `https://himangs-tiramisu.myshopify.com/admin/api/...`. The domain in that URL is literally how Shopify routes the call to the right tenant.

So when Chapter 01 said "every API request must name *which* store," this is the mechanism: the `myshopify.com` domain **is** the store's name.

### Then what's `himangs-tiramisu.com`?

That's a **custom domain** — the pretty, public-facing web address Himang buys and points at the store so shoppers see a branded URL instead of a `myshopify.com` one.

```
        SHOPPERS SEE                    SHOPIFY / YOUR CODE USE
   himangs-tiramisu.com      ───►      himangs-tiramisu.myshopify.com
   (custom domain, branded)            (permanent tenant identity)
```

Two addresses, one store. The custom domain is a friendly alias for humans; the `myshopify.com` domain is the stable identifier for machines. A merchant can change or drop the custom domain anytime, but the `myshopify.com` identity is forever — which is exactly why the technical plumbing keys off the latter.

> **Rule of thumb:** shoppers use the custom domain; your API code uses the `myshopify.com` domain.

---

## Architecture

Here's how the three concepts sit relative to the platform and to your code.

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

Notice the admin and your server both point at the *same store* — the two-doors idea from Chapter 01, now with the store drawn as the shared thing in the middle.

---

## Internal Working: what the merchant does in the admin

The admin is where the store is actually run. You don't have to memorize it, but knowing what lives there tells you what the *API* can also touch (because, remember, the admin and the Admin API are two doors into the same data):

- **Products** — add the three tiramisus, set prices, upload photos, track inventory.
- **Orders** — see what sold, mark orders fulfilled, issue refunds. *Draft orders* live here too — the ones you'll create over the API in Section 03.
- **Customers** — the owned customer list (the asset from Chapter 02).
- **Settings** — payments, shipping, taxes, the custom domain, and store details.
- **Staff** — who else can log in, and what they're allowed to do.
- **Apps** — installed add-ons (including, eventually, the app *you* build).

### Staff accounts and permissions

Himang wanted an assistant who can add products but can't see revenue. Shopify handles this with **staff accounts**: additional logins under the same store, each granted a subset of **permissions**. The assistant gets "manage products" but not "view finances."

This matters for engineers for one reason worth planting now: **an app's API access is also permission-scoped.** When your code connects to a store, it's granted specific permissions (called *scopes*) — "read products," "write draft orders" — exactly like a staff member. Same idea, applied to software. We'll make this concrete in [Section 09 — Authentication](../09-authentication/).

---

## REST & GraphQL

There's a natural question here: is a "store" or a "merchant" an object you fetch from the API? Mostly, the store is the *context* of every call rather than a thing you `GET` — but its details are exposed:

- **REST:** `GET /admin/api/2024-10/shop.json` returns the current store's details (name, domain, currency, timezone, plan). Note the object is called **`shop`** — Shopify's API name for a store.
- **GraphQL:** the top-level `shop` query field returns the same, e.g. `{ shop { name myshopifyDomain currencyCode } }`.

We're not running these yet — authentication comes first, in [Section 03](../03-rest-api/) and [Section 09](../09-authentication/). The point for now: **the store is addressed by its `myshopify.com` domain and represented in the API as the `shop` object.** Merchant and staff identity, by contrast, mostly show up later as *who authorized the app* rather than as data you routinely read.

---

## Production Considerations

- **Always key integrations off the `myshopify.com` domain, never the custom domain.** The custom domain can change or be removed; the `myshopify.com` identity is permanent and unique. If your database stores "which store is this," store the `myshopify.com` domain as the key.
- **One access token belongs to one store.** Because each store is an isolated tenant, credentials are per-store. An app installed on Himang's store cannot use those credentials to touch another store — by design.
- **Respect permission scopes.** Request only the scopes your integration needs (e.g. `read_products`, `write_draft_orders`). Over-broad access is a security liability and can slow down app approval. (Details in [Section 09](../09-authentication/).)
- **The admin and API stay in sync automatically.** If your code creates a draft order, it appears in the admin instantly, and vice versa — they're the same data. Don't build reconciliation logic assuming they might diverge; they won't, because there's only one store underneath.

---

## Common Misconceptions

**❌ "The `myshopify.com` address is a temporary URL I replace with my real domain."**
Reality: It's permanent and never goes away. The custom domain is *added on top* as a public alias. Machines keep using the `myshopify.com` identity forever.

**❌ "A store and a merchant are the same thing."**
Reality: A merchant is the owner (a business/person); a store is the tenant they run. One merchant could, in principle, run multiple stores — separate tenants, separate data.

**❌ "The admin is a separate system from the API — data could get out of sync."**
Reality: They're two interfaces to one store. A change through either shows up in the other immediately. There's nothing to sync.

**❌ "Anyone with a login to the store can do anything."**
Reality: Staff accounts are permission-scoped. The same principle scopes what an app (your code) is allowed to do.

---

## Frequently Asked Questions

**Q: Why does my store have two web addresses — `himangs-tiramisu.myshopify.com` and `himangs-tiramisu.com`?**
The `myshopify.com` one is the store's permanent, unique technical identity, assigned by Shopify and used by the API. The `.com` one is a custom domain the merchant buys so shoppers see a branded URL. Two addresses, one store; shoppers use the pretty one, your code uses the permanent one.

**Q: Is "store" the same as "shop"?**
Yes. Shopify uses them interchangeably, and the API object is literally named `shop`. This course says "store" in prose and "`shop`" when referring to the API object.

**Q: Can one merchant have multiple stores?**
Yes — each is a separate tenant with its own `myshopify.com` domain, its own data, and its own credentials. They don't share anything unless you build something to connect them.

**Q: When my server calls the API, how does Shopify know which store I mean?**
From the `myshopify.com` domain in the request URL, plus the access token, which is issued per store. Together they say "this store, and yes you're allowed." (Full mechanics in [Section 09](../09-authentication/).)

**Q: Do I, the engineer, log into the admin?**
You might, to configure things or watch data change while you build. But your *code* doesn't go through the admin — it calls the Admin API directly. The admin is for humans; the API is for your server.

---

## Interview Questions

1. Define *merchant*, *store*, and *admin* in one sentence each.
2. What is a store, technically? (Answer with the word "tenant.")
3. What is the difference between a `myshopify.com` domain and a custom domain, and which should an integration key off — and why?
4. What is the API object name for a store?
5. How does Shopify know which store an API request is for?
6. How do staff permissions relate to what an app is allowed to do?
7. If your code creates a draft order via the API, do you need to sync it to the admin? Why or why not?

---

## Summary

- A **merchant** (owner) runs a **store** through the **admin** (dashboard).
- A **store is a tenant** — one isolated container of products, customers, orders, and settings — and Shopify is multi-tenant, so millions of these coexist.
- Every store has a permanent, unique **`myshopify.com` domain** that is its true identity and the address your **API calls target**. A **custom domain** (`himangs-tiramisu.com`) is a public alias shoppers see; it can change, the `myshopify.com` one can't.
- The API represents a store as the **`shop`** object; the store is mostly the *context* of every call rather than a thing you routinely fetch.
- **Staff accounts** are permission-scoped, and the same idea scopes what an **app** may do — the bridge to authentication.
- The admin and the Admin API are **two doors into one store**; they never fall out of sync.

---

## What's Next

That completes the foundation. You can now say precisely what Shopify is, why it differs from a marketplace, and what a merchant, store, and admin are — including the technical meaning of "store" that makes the API addressable.

→ **Next: [Section 02 — Shopify Data Model](../02-shopify-data-model/).** We open the store and meet the objects inside it, starting with the one beginners misunderstand most: **Products vs. Variants** — the foundation the entire draft-order pipeline is built on.
