# Shopify vs. Amazon

The last chapter called Shopify a *platform*, not a *marketplace*, using Amazon as the counterexample. That contrast deserves its own chapter — not because you'll choose between them, but because it explains *why Shopify's data model and APIs look the way they do*. It all traces back to one fact: **on Shopify, the merchant owns the store.**

---

## Business Problem

Himang wants to sell his tiramisu online. Two obvious paths:

1. **List on Amazon** — a seller account, add the product to Amazon's catalog, let Amazon's shoppers find it.
2. **Open a Shopify store** — get `himangs-tiramisu.com`, design it, drive shoppers there.

Both sell tiramisu online, but they're different businesses. The difference isn't UI — it's *who owns what*.

---

## Mental Model

The mall analogy, plus its opposite:

- **Amazon is a giant department store.** One building, one name, one checkout counter. Himang is a supplier whose tiramisu sits on a shelf inside. Shoppers came for *Amazon* and pay *Amazon*.
- **Shopify rents Himang a standalone shop** — his name on the door, his checkout, his customer list. Shoppers came for *Himang* and pay *Himang*.

```
   AMAZON (marketplace)                 SHOPIFY (platform)

   ┌───────────────────────┐            himangs-tiramisu.com
   │       AMAZON          │            ┌────────────────────┐
   │  ┌─────┐ ┌─────┐      │            │  Himang's Store    │
   │  │Himang│ │Other│ ... │            │  (own brand,       │
   │  │shelf │ │seller│    │            │   own customers,   │
   │  └─────┘ └─────┘      │            │   own checkout)    │
   │   one checkout counter│            └────────────────────┘
   └───────────────────────┘
   Shopper came for Amazon              Shopper came for Himang
```

In one line: **on Amazon, Himang rents shelf space; on Shopify, Himang rents a shop.**

---

## Architecture

The technical consequence is where the *customer relationship* and the *data* live.

```
AMAZON                                   SHOPIFY

Shopper ── buys ──► AMAZON               Shopper ── buys ──► HIMANG'S STORE
                      │                                        │
                      │ Amazon owns:                           │ Himang owns:
                      ▼                                        ▼
              - the customer               - the customer (email, history)
              - the checkout               - the checkout & branding
              - the order data             - the order data
              - the relationship           - the relationship
                      │                                        │
              Himang gets: a payout        Himang gets: full store + all data
              + limited order info         + APIs to build on top
```

The crux for an engineer: **Shopify gives you the store's data and lets you build software against it.** Amazon gives a seller a constrained Seller Central account and a narrow API. That's why "build a production integration" is a sensible sentence for Shopify — and why this course is about Shopify.

---

## Internal Working: what each side controls

| Dimension | Amazon (marketplace) | Shopify (platform) |
|---|---|---|
| **Who owns the customer** | Amazon. Himang usually can't email past buyers. | Himang. Full customer list, emails, history. |
| **Brand** | Amazon's. Himang is one listing. | Himang's. Own domain and look. |
| **Discovery / traffic** | Amazon brings shoppers. | Himang must bring traffic (ads, SEO, social). |
| **Checkout** | Amazon's, identical for all sellers. | Himang's, customizable. |
| **Competition** | Direct — a rival is one click away. | Indirect — shoppers see only Himang. |
| **Data & APIs** | Seller Central + limited API. | Full Admin API to read/write store data. |
| **Fulfillment** | Often FBA — Amazon warehouses & ships. | Himang's choice (self-ship, 3PL, apps). |
| **Fees** | Referral % per sale + often FBA fees. | Subscription + payment processing %. |
| **Effort to start** | Low — plug into a crowd. | Higher — you build the storefront and audience. |

Terms from that table, since they recur:

- **Fulfillment** — everything *after* payment to get the product to the buyer: storing, picking, packing, shipping, returns. Deliberately separate from *payment* — a core idea in [Section 02](../02-shopify-data-model/) and [Section 07](../07-payments/).
- **FBA (Fulfillment by Amazon)** — the seller ships stock to Amazon's warehouses; Amazon stores, packs, ships, and handles returns.
- **Self-ship** — the merchant ships orders themselves.
- **3PL (Third-Party Logistics)** — an outside company you hire to warehouse and ship (e.g. ShipBob) — like FBA, but a vendor *you* control.
- **Apps** — Shopify add-ons that wire fulfillment into the store (labels, 3PL, tracking). [Section 06](../06-app-architecture/).

So the fulfillment row: Amazon usually bundles logistics via FBA; Shopify warehouses nothing — it *tracks* fulfillment status but leaves *how* to you.

The whole table is one trade-off:

> **Amazon trades ownership for reach. Shopify trades reach for ownership.**

Amazon gives a crowd but keeps the customer relationship; Shopify gives the whole relationship but no crowd. Neither is "better" — many merchants do both: Amazon for discovery, Shopify to own the customers they can.

---

## Why this shapes everything later

The ownership split is *why* the rest of the course exists:

- Himang owns the customer → there's a **Customer** object you can read and write ([Section 02](../02-shopify-data-model/)). On Amazon, that data mostly isn't yours.
- Himang owns the checkout → you can create a **Draft Order** and send Alice an invoice ([Section 03](../03-rest-api/)) — the "sell over the phone" flow this repo is built around. A marketplace has no equivalent.
- Himang owns the store → Shopify gives you a **full Admin API and webhooks**. That's what makes a Shopify integration a real engineering project.

Every capability you'll learn is downstream of *the merchant owns the store*.

---

## REST & GraphQL

- Shopify's **Admin API** (REST in [Section 03](../03-rest-api/), GraphQL in [Section 05](../05-graphql/)) exists because the merchant owns the store's data and gets full programmatic access to it.
- Amazon's seller APIs are scoped to a *supplier's* view inside Amazon's store — you operate within their walls, not over your own.

The APIs differ because the ownership differs.

---

## Production Considerations

- **The customer list is a durable asset.** On Shopify, Himang can re-market to past buyers forever; on Amazon that channel is mostly closed.
- **Traffic is the hidden cost of Shopify.** A store with no marketing is an empty shop — budget for acquisition.
- **Platform risk cuts both ways.** Amazon can suspend you overnight; on Shopify you depend on Shopify's uptime and terms but keep your domain, brand, and data.
- **"Both" is valid.** Amazon for reach, Shopify to own the customers you convert. This course automates the Shopify half.

---

## Common Misconceptions

**❌ "Shopify and Amazon do the same thing."**
Different problems: Amazon brings *shoppers*; Shopify gives you a *store you own*. A merchant can use both.

**❌ "On Shopify, customers browse a central site like Amazon."**
No central storefront. Each store has its own domain, and Himang must bring the shoppers.

**❌ "Amazon gives me the same control and data — just a different UI."**
Amazon keeps the customer relationship, checkout, and most buyer data. That's the marketplace bargain; ownership is exactly what Shopify gives and Amazon withholds.

**❌ "Amazon is bigger, so Shopify is the worse choice."**
"Harder to start" (you supply traffic) isn't "worse" — it buys ownership, branding, and custom software Amazon doesn't allow.

---

## Frequently Asked Questions

**Q: If Amazon already has millions of shoppers, why choose Shopify?**
To *own* the business — brand, customer list, checkout, and data. On Amazon, Himang is a replaceable supplier; on Shopify he owns the relationship.

**Q: Does Shopify bring me customers?**
No. Shopify runs the store; it doesn't fill it. Discovery is entirely the merchant's job.

**Q: Can a merchant use both?**
Yes — Amazon for reach, Shopify to own the customers you convert. (Cross-platform inventory sync exists, but that's advanced.)

**Q: Why does this course teach Shopify, not Amazon?**
Shopify gives a full Admin API and webhooks over a store *you* control. Amazon's APIs are narrower and bounded by its marketplace rules.

---

## Interview Questions

1. Define marketplace vs. platform, placing Amazon and Shopify.
2. Who owns the customer relationship in each, and why does it matter?
3. Shopify gives a store but not shoppers — what does that imply for costs and effort?
4. State the core trade-off in one sentence.
5. Why does the ownership model make a Shopify integration a real engineering project?
6. Give a concrete reason to use both Amazon and Shopify.

---

## Summary

- **Amazon is a marketplace; Shopify is a platform.** One big shared store vs. your own store.
- The dividing line is **ownership**: on Shopify the merchant owns the customer, brand, checkout, and data; on Amazon, Amazon keeps most of it.
- The trade-off: **Amazon trades ownership for reach; Shopify trades reach for ownership** — you get a store but must bring the traffic.
- This ownership model is *why* Customer objects, Draft Orders, the Admin API, and webhooks exist.
- Using **both** is a common, rational strategy.

---

## What's Next

→ **Next: Merchants, stores, and the admin** — who a merchant is, what a "store" is under the hood, and what the merchant does in the dashboard. Then [Section 02 — Shopify Data Model](../02-shopify-data-model/): Products, Variants, Customers, and the Draft Order.
