# What is Shopify?

You can already build a backend: `products`, `customers`, `orders` tables, a payment integration, some HTML. So the real first question is:

> If I could build a store myself, **what is Shopify for?**

This chapter answers that — no APIs yet, just the mental model the rest of the course builds on.

---

## Business Problem

**Himang** is a baker who wants to sell tiramisu — Classic, Chocolate, Matcha — online. To do that, he needs:

- A website with product pages and a cart.
- Payment handling — ideally *never* touching raw card numbers (that means PCI-DSS compliance).
- Inventory tracking, so he doesn't oversell.
- Tax and shipping calculation (both vary by location).
- Order emails, receipts, and a dashboard to refund or reprint.
- Fraud detection, uptime, backups, and security patches — forever.

Himang could hire engineers to build all this. It would take months and cost more than the business earns for years.

Shopify provides all of it as a service:

> **Shopify is infrastructure that lets someone run an online store without building the store's software themselves.**

---

## Mental Model

**Shopify is to online stores what a mall's landlord is to the shops inside.**

The landlord (Shopify) owns the building and runs the plumbing, power, and security. Each merchant (Himang) rents a unit, brands it, stocks it, and keeps the profits — without touching the wiring.

Three consequences explain a lot of Shopify's design:

- **Many shops, one building.** Millions of stores share the infrastructure. This is why every API request must name *which* store it's for.
- **You customize your unit, not the building.** Himang controls colors, layout, products — not how Shopify bills electricity. That's the line between your code and Shopify's platform.
- **The landlord provides services you plug into.** Payments, tax, shipping — you connect to them, you don't rebuild them.

When something feels strange later, ask "how would a mall handle this?" It's right surprisingly often.

---

## Platform vs. marketplace

The most common beginner misconception, killed early:

**Shopify is a platform, not a marketplace.**

A **marketplace** (Amazon, eBay, Etsy) is one giant store many sellers list *inside*. Shoppers go to `amazon.com`; Amazon owns the customer, checkout, and brand. Sellers are guests.

A **platform** (Shopify) gives each merchant *their own* store, at their own address, with their own brand. There's no `shopify.com` megastore — customers go to `himangs-tiramisu.com`, and Himang owns the customer and brand.

```
MARKETPLACE (Amazon)                 PLATFORM (Shopify)

        amazon.com                    himangs-tiramisu.com   alices-books.com
     ┌──────────────┐                 ┌────────────────┐     ┌──────────────┐
     │  one big     │                 │ Himang's store │     │ Alice's store│
     │  store, many │                 │ (own brand,    │     │ (own brand)  │
     │  sellers     │                 │  own domain)   │     │              │
     └──────────────┘                 └────────────────┘     └──────────────┘
   Amazon owns the customer          Each merchant owns their own customer
```

The next chapter covers this contrast in depth. For now: **Shopify hands out stores; it does not run a store.**

---

## Architecture

The key idea, and the one beginners get backwards: **there is one platform in the middle, and everything else — the storefront, the dashboard, your server — is a *client* of it.** No client sits behind another; they're peers, each reaching the platform through a door sized to how much it's trusted.

```
        THE SHOPIFY WORLD

   Shopper              Merchant (Himang)        You (backend engineer)
     │                        │                          │
     │ browser                │ logs into                │ writes
     ▼                        ▼                          ▼
┌───────────┐        ┌─────────────────┐        ┌─────────────────┐
│ Storefront│        │   Admin UI      │        │   Your Server   │
│ (public   │        │  (dashboard —   │        │  (custom code / │
│  website) │        │  itself just a  │        │   an app)       │
└───────────┘        │  client)        │        └─────────────────┘
     │               └─────────────────┘                 │
     │ Storefront API          │ Admin API      Admin API │
     │  or Liquid themes       │ (same door)              │
     └────────────┬────────────┴────────────┬─────────────┘
                  ▼                          ▼
     ┌───────────────────────────────────────────────────────┐
     │                   SHOPIFY PLATFORM                      │
     │  the source of truth: databases, payments, tax,         │
     │  hosting, security — reached through the Admin API,     │
     │  Storefront API, and Liquid themes                      │
     └───────────────────────────────────────────────────────┘
                              │
                              │ when events happen, the platform
                              │ pushes notifications out (webhooks)
                              ▼
                     ┌─────────────────┐
                     │   Your Server   │
                     └─────────────────┘
```

Three surfaces matter to engineers:

1. **The Storefront** — what the *shopper* sees. Usually a **theme** Shopify renders itself (via Liquid); a custom frontend uses the **Storefront API**. Either way, never your server's Admin API.
2. **The Admin UI** — what the *merchant* sees. The dashboard for products, orders, refunds. It's just another client of the platform.
3. **The APIs** — what *your code* uses:
   - **Admin API** — your server reads/writes store data. [Section 03](../03-rest-api/) and [Section 05](../05-graphql/).
   - **Webhooks** — the platform calls your server on events. [Section 04](../04-webhooks/).

The one thing to remember: **the Admin UI and the Admin API are two doors into the same data — not a door behind a door.** The dashboard is just a UI; the API is the same power without the UI.

### Why is it called the *Admin* API?

Because it does what an **admin** (the merchant) can do — manage the store. Not because it routes through the dashboard. This is what "API-first" means: Shopify's own dashboard is built on the same APIs it gives you, so there's no private backdoor the UI has that your code lacks.

### Admin API vs. Storefront API: two doors, one platform

Why does the storefront get a *different* API than your server? A **trust boundary**.

```
   TRUSTED (server-side)              UNTRUSTED (shopper's browser)
┌────────────────────────┐         ┌────────────────────────────┐
│  Your Server            │         │  Custom storefront         │
│  → Admin API            │         │  → Storefront API          │
│  full read/write power  │         │  narrow, public, safe      │
│  SECRET token           │         │  PUBLIC token              │
└────────────────────────┘         └────────────────────────────┘
```

The **Admin API** can do anything — read every customer, refund orders, change prices. Its token is a **secret** that lives only on your server.

The **Storefront API** runs in the shopper's browser, which is untrusted (anyone can read the code). So it's a deliberately **narrow, public** door: browse products, manage a cart, start a checkout — but it can't read other customers' data or change prices. Its token is safe to expose. (More on tokens in [Section 09](../09-authentication/).)

---

## Internal Working

What Shopify runs on your behalf — you don't implement any of it, but knowing it exists explains the API's shape. When Alice buys a Classic Tiramisu:

- **Data layer.** Products, variants, customers, orders — in Shopify's databases, isolated per store. This *multi-tenancy* is why every request is scoped to one store's domain and token.
- **Commerce engine.** Cart math, discounts, tax rules, shipping rates — decades of edge cases you don't want to reimplement.
- **Payments.** Via Shopify Payments or a gateway. Raw card data stays away from both Himang and you.
- **Event system.** On an order paid or product changed, Shopify emits an event and (if subscribed) calls your webhook — so your systems stay in sync without polling.

> Shopify owns the **source of truth**. Your code *participates*: it asks Shopify to change things (Admin API) and is told when things change (webhooks). You're not building the store — you're building software that collaborates with one that already works.

---

## Where REST and GraphQL fit

The Admin API speaks both — two languages for the same platform:

- **REST** — many endpoints, fixed JSON shapes (`GET /products`, `POST /draft_orders`). We start here in [Section 03](../03-rest-api/).
- **GraphQL** — one endpoint where *you* describe the shape you want. Where Shopify is investing. [Section 05](../05-graphql/).

Two doors to the same rooms, not two buildings.

---

## Production Considerations

- **You share the infrastructure.** Shopify enforces **rate limits**; budget your requests. ([Section 10](../10-production/).)
- **Design for eventual consistency.** Treat any local copy of orders as a *cache* webhooks keep fresh, not the authority.
- **Avoid raw payment data.** Keeping card data out of your systems removes a huge compliance burden.
- **Pin an API version** (e.g. `2024-10`) and migrate deliberately; don't drift.

---

## Common Misconceptions

**❌ "Shopify is a marketplace like Amazon — I'll list my product and shoppers will find it."**
There's no central Shopify storefront. Each merchant gets their own store, and discovery (SEO, ads, social) is the merchant's job.

**❌ "My server is the backend; Shopify is just the frontend."**
The opposite. Shopify is the backend and source of truth; your server is an integration.

**❌ "The Admin API talks to the Admin dashboard."**
It talks to the *platform*, directly. It's "Admin" because it does what a merchant can do — not because it routes through the UI. Server and dashboard are peers.

**❌ "The storefront uses the same API my server does."**
No. Your server uses the **Admin API** (secret, full power). A custom storefront uses the **Storefront API** (public, narrow); most storefronts are themes using no API you touch.

**❌ "I need to store credit card numbers to charge customers."**
You almost never touch card data — Shopify and its gateways handle it, keeping you out of PCI scope.

**❌ "REST and GraphQL are two different Shopify products."**
Two interfaces to the same platform and data. Choosing one doesn't lock out the other.

**❌ "If I can build a store myself, Shopify offers me nothing."**
You can build the mechanics. You can't cheaply build the *maintained, compliant, always-on* version forever. That maintenance is the product.

---

## Frequently Asked Questions

**Q: Is Shopify a website builder, a payment processor, or a database?**
All of those plus more (tax, shipping, fraud, hosting), bundled. Think "everything a store needs, as a service."

**Q: With no central storefront, how do customers find Himang's store?**
Like any independent website: search, ads, social, word of mouth. Bringing traffic is the merchant's job.

**Q: Do I, the backend engineer, build the shopper-facing website?**
Often not. Merchants usually pick a theme; you build *integrations* — syncing orders, automating draft orders, reacting to webhooks.

**Q: Why does every example mention "which store"?**
Because Shopify is multi-tenant. Every call must identify the store (by domain) and prove it's allowed (by token).

**Q: "API-first" — do the APIs talk to the platform or the dashboard?**
The platform, directly. Shopify's own dashboard is built on the same APIs, so it's just another client — not a layer your calls pass through.

**Q: Is a Shopify "app" the same as "my server"?**
Roughly, for now. An app is code that integrates with Shopify; "your server with an access token" is the simplest form. Real apps add installation, OAuth, and hosting ([Section 06](../06-app-architecture/), [Section 09](../09-authentication/)).

---

## Interview Questions

1. In one sentence, what problem does Shopify solve for a small merchant?
2. Platform vs. marketplace — explain using Shopify and Amazon.
3. Who owns the source of truth, and why does it matter for integration design?
4. Name the three surfaces of Shopify and who each serves.
5. Why must every API request identify a specific store?
6. Why is it good that your server rarely touches card data?
7. Are REST and GraphQL two different products? Explain.

---

## Summary

- Shopify is **infrastructure for running an online store** — the engineering team a small merchant can't afford.
- It's a **platform, not a marketplace**: each merchant gets their own self-branded store; there's no central storefront shoppers browse.
- **Mall analogy:** Shopify is the building; merchants are tenants who customize their unit but don't touch the wiring.
- Three surfaces: **Storefront** (shoppers), **Admin** (merchants), **APIs** (your code). The Admin UI and Admin API are two doors into the *same* data.
- Shopify owns the **source of truth**; your code asks it to change things (Admin API) and is told when things change (webhooks).
- **REST and GraphQL** are two interfaces to one platform.

---

## What's Next

→ **Next: Shopify vs. Amazon** — platform and marketplace side by side, and what the contrast teaches about ownership.

Then [Section 02 — Shopify Data Model](../02-shopify-data-model/): Products, Variants, Customers, and the **Draft Order**.
