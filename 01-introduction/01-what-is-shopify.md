# What is Shopify?

You already know how to build a backend — `products`, `customers`, and `orders` tables, a payment integration, some HTML. So the honest first question isn't "how does Shopify work?" but:

> If I could build a store myself, **what is Shopify actually for?**

This chapter answers that, without calling a single API. By the end you'll have the mental model that makes every later chapter feel obvious.

---

## Business Problem

Meet **Himang**, a baker who wants to sell tiramisu — Classic, Chocolate, and Matcha — online. Himang is a baker, not a backend engineer.

To sell online, Himang needs, at minimum:

- A website with product pages and a shopping cart.
- A way to take payment — and, ideally, to *never* touch raw card numbers, because handling them means PCI-DSS compliance.
- Inventory tracking, so Himang doesn't sell 50 Matcha tiramisus when only 30 exist.
- Tax and shipping calculation (both vary by location).
- Order emails, receipts, and a dashboard to refund or reprint orders.
- Fraud detection, plus uptime, backups, and security patches — forever.

Himang could hire a team of engineers to build all of this. It would take months and cost more than the business will make for years.

**This is the problem Shopify solves.** It provides all of the above as a service — the team of engineers Himang can't afford — so a baker can run a real store the same afternoon they decide to:

> **Shopify is infrastructure that lets someone run an online store without building the store's software themselves.**

The key word is *infrastructure*.

---

## Mental Model

Here is the analogy to carry through the entire course.

**Shopify is to online stores what a mall's landlord is to the shops inside.**

The landlord (Shopify) owns the building and runs the plumbing, electricity, and security. Each merchant (like Himang) rents a unit, brands it, stocks it, and keeps the profits — without ever touching the wiring.

Three consequences of this analogy explain a lot of Shopify's design:

- **Many shops, one building.** Millions of stores share the same infrastructure. This is why every API request must name *which* store it's for — the building has many doors.
- **You customize your unit, not the building.** Himang controls colors, layout, and products; not how Shopify bills electricity or locks the doors. That line is exactly the line between your code and Shopify's platform.
- **The landlord provides services you plug into.** Payments, tax, shipping — you connect to them, you don't rebuild them.

When something about Shopify feels strange later, ask "how would a mall handle this?" It's right surprisingly often.

---

## A crucial distinction: platform vs. marketplace

Here is the single most common misconception a newcomer brings in, so let's kill it early.

**Shopify is a platform. It is not a marketplace.**

A **marketplace** — Amazon, eBay, Etsy — is one giant store that many sellers list *inside*. Shoppers go to `amazon.com` and Amazon owns the customer, the checkout, and the brand. Sellers are guests in Amazon's house.

A **platform** — Shopify — gives each merchant *their own* store, at their own address, with their own brand. There is no `shopify.com` megastore to browse; customers go to `himangs-tiramisu.com`, and Himang owns the customer and the brand. Shopify is invisible to the shopper.

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

We'll dedicate the next chapter to *Shopify vs. Amazon* in depth, because the contrast teaches more than either does alone. For now, just lock in: **Shopify hands out stores; it does not run a store.**

---

## Architecture

Here is the pivotal idea, and it's the one beginners get backwards: **there is one platform in the middle, and everything else — the storefront, the merchant's dashboard, your server — is a *client* of it.** No client sits "behind" another. They're peers, each reaching the platform through a door sized to how much it can be trusted.

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

Three surfaces matter to us as engineers, and it's worth naming them precisely because the rest of the course is organized around them:

1. **The Storefront** — what the *shopper* sees. The public website. For most merchants this is a **theme** that Shopify renders itself (using Liquid); a custom frontend would instead call the **Storefront API**. Either way, it never uses your server's Admin API — more on that just below.
2. **The Admin UI** — what the *merchant* sees. The dashboard where Himang adds products, views orders, and issues refunds. It is itself just a client of the platform.
3. **The APIs** — what *your code* sees. This is our home for most of the course:
   - The **Admin API** — your server *reads and writes* store data (create a product, create a draft order, look up a customer). Covered in [Section 03](../03-rest-api/) and [Section 05](../05-graphql/).
   - **Webhooks** — the platform *calls your server* when something happens (an order was paid). Covered in [Section 04](../04-webhooks/).

If you remember nothing else from the diagram, remember this: **the Admin UI and the Admin API are two doors into the same data — not a door behind a door.** When Himang clicks "Add product," the dashboard calls the platform; when your server POSTs to the products endpoint, it calls the same platform. The dashboard is just a UI; the API is the same power without the UI.

### Why is it called the *Admin* API?

Because it does what an **admin** (the merchant) can do — manage the store. **Not** because it routes through the Admin dashboard. Your server talking to the Admin API and Himang clicking in the dashboard are *peers*; neither goes through the other. This is what "API-first" really means: Shopify's own dashboard is built on the same APIs it gives you, so there's no private backdoor the UI has that your code lacks.

### Admin API vs. Storefront API: one platform, two doors

If everything is a client of one platform, why does the storefront get a *different* API than your server? Because of a **trust boundary**.

```
   TRUSTED (server-side)              UNTRUSTED (shopper's browser)
┌────────────────────────┐         ┌────────────────────────────┐
│  Your Server            │         │  Custom storefront         │
│  → Admin API            │         │  → Storefront API          │
│  full read/write power  │         │  narrow, public, safe      │
│  SECRET token           │         │  PUBLIC token              │
└────────────────────────┘         └────────────────────────────┘
```

The **Admin API** can do anything — read every customer, refund orders, change prices. Its token is a **secret** that lives only on your server and must never reach a browser.

The **Storefront API** is meant to run in the shopper's browser, which is untrusted — anyone can open dev tools and read the code. So it's a deliberately *narrow, public* door: it can browse products, manage a cart, and start a checkout, but it **cannot** read other customers' data or change prices. Its token is safe to expose.

(And most merchants use neither directly for the storefront — they pick a **theme**, and Shopify renders the pages itself with Liquid. We'll return to tokens and trust in [Section 09 — Authentication](../09-authentication/).)

---

## Internal Working

Let's make "the building" less magical by naming what Shopify actually runs on your behalf. You don't need to implement any of it — that's the point — but knowing it exists explains why the API is shaped the way it is.

When Alice buys a Classic Tiramisu from Himang's store, Shopify internally coordinates:

- **The data layer.** Products, variants, customers, orders — stored in Shopify's databases, isolated per store. Himang can never see Alice's Books' data, and vice versa. This *multi-tenancy* is why every API request is scoped to one store's domain and one store's access token.
- **The commerce engine.** Cart math, discounts, tax rules per jurisdiction, shipping rates. This is decades of edge cases you don't want to reimplement.
- **Payments.** Through *Shopify Payments* or third-party gateways, Shopify moves money and — critically — keeps raw card data away from both Himang and you. You will almost never handle a card number, and that's a feature.
- **The event system.** When an order is paid or a product changes, Shopify emits an event. If you've subscribed a webhook, Shopify makes an HTTP request to your server. This is how your systems stay in sync without polling.

The takeaway:

> Shopify owns the **source of truth**. Your code is a *participant* — it asks Shopify to change things (Admin API) and gets told when things change (webhooks). Your server is never the master record; Shopify is.

You are not building the store. You are building software that collaborates with a store that already works.

---

## Where do REST and GraphQL fit?

Shopify's Admin API speaks both REST and GraphQL. They're two languages for the same platform:

- **REST** — many endpoints, each returning a fixed JSON shape: `GET /products`, `POST /draft_orders`. We start here in [Section 03](../03-rest-api/) because it's familiar.
- **GraphQL** — one endpoint where *you* describe the exact shape you want. It's where Shopify is investing. Covered from zero in [Section 05](../05-graphql/).

You don't need to choose now — they're two doors to the same rooms, not two buildings.

---

## Production Considerations

A few realities worth planting now so they're not a surprise later:

- **You share the infrastructure.** Shopify enforces **rate limits** — you can't hammer it. Well-behaved integrations budget their requests. (Details in [Section 10](../10-production/).)
- **Design for eventual consistency.** If you keep a local copy of orders, treat it as a *cache* that webhooks keep fresh — not the authority.
- **Avoid raw payment data.** Keeping card data out of your systems removes an enormous compliance burden. Preserve that.
- **Pin an API version.** Shopify's API is versioned (e.g. `2024-10`); what you build keeps working for a supported window, then you migrate. Pin deliberately; don't drift.

---

## Common Misconceptions

**❌ "Shopify is a marketplace like Amazon — I'll list my product on Shopify and shoppers will find it there."**
Reality: Shopify is a *platform*. There is no central Shopify storefront that shoppers browse. Each merchant gets their own independent, self-branded store. Discovery (SEO, ads, social) is the merchant's job, not Shopify's.

**❌ "My server is the backend of the store; Shopify is just the frontend."**
Reality: It's the opposite. *Shopify* is the backend and the source of truth. Your server is an *integration* that collaborates with Shopify's backend through APIs and webhooks.

**❌ "The Admin API talks to the Admin dashboard."**
Reality: The Admin API talks to the *platform*, directly. It's called "Admin" because it does what a merchant/admin can do — not because it routes through the dashboard UI. Your server and the dashboard are peers; both are clients of the same platform.

**❌ "The storefront uses the same API my server does."**
Reality: No. Your server uses the **Admin API** (secret token, full power). A custom storefront uses the **Storefront API** (public token, narrow and browser-safe) — and most storefronts are just Shopify-rendered themes that use no API you touch at all. Different clients get different doors, sized to their trust level.

**❌ "I need to store customers' credit card numbers to charge them."**
Reality: You almost never touch card data. Shopify (and its payment providers) handle it, keeping you out of PCI scope. This is intentional and valuable.

**❌ "REST and GraphQL are two different Shopify products."**
Reality: They are two *interfaces* to the same platform and the same data. Choosing one doesn't lock you out of the other.

**❌ "If I can build a store myself, Shopify has nothing to offer me."**
Reality: You *can* build the mechanics. What you can't cheaply build is the *maintained, compliant, always-on* version of all of it — payments, tax, fraud, uptime, security patches — forever. That maintenance is the product.

---

## Frequently Asked Questions

**Q: Is Shopify a website builder, a payment processor, or a database?**
Yes — it's all of those bundled into one platform, plus more (tax, shipping, fraud, hosting). Thinking of it as any single one of them undersells it. Think "everything a store needs, as a service."

**Q: If there's no central Shopify storefront, how do customers find Himang's store?**
The same way they'd find any independent website: search engines, ads, social media, word of mouth. Bringing traffic is the merchant's responsibility. Shopify runs the store; it doesn't fill it with shoppers.

**Q: Do I, the backend engineer, build the shopper-facing website?**
Often not, at first. Merchants usually pick a *theme* for the storefront. As a backend engineer you typically build *integrations* — syncing orders to another system, automating draft orders, reacting to webhooks. The storefront is a separate concern (touched on in [Section 06](../06-app-architecture/) and [Section 08](../08-checkout/)).

**Q: Why does every example keep mentioning "which store"?**
Because Shopify is multi-tenant — millions of stores share the infrastructure. Every API call must identify the store (by its domain) and prove it's allowed (by an access token). The "building has many doors" detail from the mall analogy is literally why.

**Q: Shopify is "API-first" — do those APIs talk to the Shopify platform or to the Admin dashboard?**
To the platform, directly. "API-first" means Shopify's *own* Admin dashboard is built on the same APIs it exposes to you — so the dashboard is just another client, not a layer your API calls pass through. Your server and the dashboard are peers reaching the same platform.

**Q: Does the storefront use the same API my server uses?**
No. Your server uses the **Admin API** (a secret token, full power). A custom storefront uses the **Storefront API** (a public token, narrow and safe to run in a browser), and a classic themed storefront uses no API you touch — Shopify renders it with Liquid. The split exists because a shopper's browser is untrusted, so it can't be handed the powerful secret token.

**Q: Is a Shopify "app" the same as "my server"?**
Roughly, for now. An *app* is code that extends or integrates with Shopify. Early on, "your server with an access token" is the simplest form of that. Real apps add installation, OAuth, and hosting — see [Section 06](../06-app-architecture/) and [Section 09](../09-authentication/). We'll grow the definition gradually.

---

## Interview Questions

Use these to check yourself. If you can answer each in a few sentences, this chapter did its job.

1. In one sentence, what problem does Shopify solve for a small merchant?
2. Explain the difference between a *platform* and a *marketplace*, using Shopify and Amazon.
3. Who owns the source of truth for a Shopify store's data — the merchant's own server or Shopify? Why does that matter for how you design an integration?
4. Name the three "surfaces" of Shopify from an engineer's perspective and who each one serves.
5. Why does every Shopify API request need to identify a specific store?
6. Why is it a *good thing* that your server rarely touches raw credit card data?
7. Are REST and GraphQL two different Shopify products? Explain.

---

## Summary

- Shopify is **infrastructure for running an online store** — the "team of engineers" a small merchant like Himang can't afford to hire.
- It's a **platform, not a marketplace**: each merchant gets their own independent, self-branded store. There is no central Shopify storefront shoppers browse.
- The **mall analogy** carries the whole idea: Shopify is the landlord's building; merchants are tenants who customize their unit but don't touch the wiring.
- Three surfaces matter to engineers: the **Storefront** (shoppers), the **Admin** (merchants), and the **APIs** (your code). The Admin and the Admin API are two doors into the *same* data.
- Shopify owns the **source of truth**. Your code *participates*: it asks Shopify to change things (Admin API) and is told when things change (webhooks).
- **REST and GraphQL** are two interfaces to the same platform — not two products.

---

## What's Next

Now that "what is Shopify?" has a real answer, the sharpest way to deepen it is by contrast.

→ **Next chapter: Shopify vs. Amazon** — we put the platform and the marketplace side by side and let the differences teach us how Shopify thinks about stores, customers, and ownership.

After that, [Section 02 — Shopify Data Model](../02-shopify-data-model/) introduces the objects you'll spend the rest of the course working with: Products, Variants, Customers, and the star of this repository, the **Draft Order**.
