# Shopify vs. Amazon

The last chapter said Shopify is a *platform*, not a *marketplace*, and used Amazon as the counterexample. That contrast is worth a chapter of its own — not because you'll ever "choose between them" as an engineer, but because the difference explains *why Shopify's data model and APIs look the way they do*. Almost every design decision later in this course traces back to one root fact: on Shopify, the merchant owns the store.

---

## Business Problem

Himang has finished the first batch of tiramisu and wants to sell online. There are two obvious paths:

1. **List the tiramisu on Amazon.** Create a seller account, add the product to Amazon's catalog, and let Amazon's existing shoppers find it.
2. **Open a Shopify store.** Get `himangs-tiramisu.com`, design it, and drive shoppers there.

Both let Himang sell tiramisu online. But they are fundamentally different businesses, and the difference isn't UI — it's *who owns what*. Understanding that ownership split is the point of this chapter.

---

## Mental Model

Reuse the mall analogy, and add its opposite.

- **Amazon is a giant department store.** One building, one name over the door, one checkout counter. Himang is a supplier whose tiramisu sits on a shelf inside. Shoppers came for *Amazon*, not for Himang. When they pay, they pay *Amazon*.
- **Shopify is the landlord who rents Himang an entire standalone shop** — Himang's name on the door, Himang's checkout counter, Himang's customer list. Shoppers came for *Himang*. When they pay, they pay *Himang* (through plumbing the landlord provides).

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

One line to hold onto: **on Amazon, Himang rents shelf space; on Shopify, Himang rents a shop.**

---

## Architecture

The technical consequence of that ownership split is where the *customer relationship* and the *data* live.

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

For you, the engineer, this is the crux: **Shopify gives you the store's data and lets you build software against it.** Amazon gives a seller a constrained "Seller Central" account and a narrow API bounded by what Amazon permits. The Shopify path is the one where "build a production integration" is even a sensible sentence — which is exactly why this course is about Shopify.

---

## Internal Working: what each side actually controls

Line them up on the things that matter to a business.

| Dimension | Amazon (marketplace) | Shopify (platform) |
|---|---|---|
| **Who owns the customer** | Amazon. Himang usually can't email past buyers. | Himang. Full customer list, emails, history. |
| **Brand** | Amazon's. Himang is one listing among many. | Himang's. Own domain, own look. |
| **Discovery / traffic** | Amazon brings shoppers already searching. | Himang must bring traffic (ads, SEO, social). |
| **Checkout** | Amazon's, identical for every seller. | Himang's, customizable. |
| **Competition** | Direct — rival tiramisu sits one click away. | Indirect — a shopper on Himang's site sees only Himang. |
| **Data & APIs** | Constrained to Seller Central + limited API. | Full Admin API to read/write store data. |
| **Fulfillment** | Often FBA — Amazon warehouses & ships. | Himang's choice (self-ship, 3PL, apps). |
| **Fees** | Referral % per sale + often FBA fees. | Subscription + payment processing %. |
| **Effort to start** | Low — plug into an existing crowd. | Higher — you build the storefront and the audience. |

Read the table as a single trade-off:

> **Amazon trades ownership for reach. Shopify trades reach for ownership.**

Amazon hands Himang a crowd but keeps the customer relationship. Shopify hands Himang the whole relationship but no crowd — Himang has to earn the traffic. Neither is "better"; they're different bets. Many real merchants do both: Amazon for discovery, a Shopify store to own the customers they can.

---

## Why this shapes everything later

This isn't trivia. The ownership split is the *reason* the rest of the course exists:

- Because Himang owns the customer, there's a **Customer** object you can read and write ([Section 02](../02-shopify-data-model/)). On Amazon, that data mostly isn't yours to touch.
- Because Himang owns the checkout, you can create a **Draft Order** and send Alice a personal invoice ([Section 03](../03-rest-api/)) — the exact "sell over the phone" flow this repository is built around. A marketplace has no equivalent; checkout is fixed.
- Because Himang owns the store, Shopify gives you a **full Admin API and webhooks** to build on. That's what makes a "Shopify integration" a real engineering project.

Every capability you'll learn is downstream of *the merchant owns the store*.

---

## REST & GraphQL

There's no API call for "Shopify vs. Amazon" — it's a positioning concept, not an object. But it's worth noting *what* the APIs in this course are, precisely because of the ownership model:

- Shopify's **Admin API** (REST in [Section 03](../03-rest-api/), GraphQL in [Section 05](../05-graphql/)) exists because the merchant owns the store's data and is entitled to full programmatic access to it.
- Amazon's seller APIs exist too, but they're scoped to a *supplier's* view inside Amazon's store — you operate within Amazon's walls, not over your own.

The APIs differ because the ownership differs. Keep that link in mind when the endpoints start appearing.

---

## Production Considerations

If you're advising a real merchant (or building for one), the platform choice has operational weight:

- **Owning the customer list is a durable asset.** On Shopify, Himang can re-market to past buyers forever. On Amazon, that channel is mostly closed — a strategic dependency on Amazon's goodwill.
- **Traffic is the hidden cost of Shopify.** A Shopify store with no marketing is an empty shop. Budget for acquisition; the platform won't hand you shoppers.
- **Platform risk cuts both ways.** On Amazon, a policy change or suspension can end the business overnight. On Shopify, you depend on Shopify's uptime and terms, but you keep your domain, brand, and customer data.
- **"Both" is a common, valid answer.** Sell on Amazon for reach *and* run a Shopify store to convert those buyers into owned customers. The technical work in this course is what makes the Shopify half automatable.

---

## Common Misconceptions

**❌ "Shopify and Amazon are competitors doing the same thing."**
Reality: They solve different problems. Amazon is a marketplace that brings you *shoppers*; Shopify is a platform that gives you a *store you own*. A merchant can rationally use both at once.

**❌ "On Shopify, customers browse a central Shopify site the way they browse Amazon."**
Reality: There is no central Shopify storefront. Each store lives at its own domain. If Himang wants shoppers, Himang has to bring them.

**❌ "Amazon gives me the same control and data a Shopify store does — it's just a different UI."**
Reality: Amazon deliberately keeps the customer relationship, the checkout, and most buyer data. That's the marketplace bargain. Control and data ownership are exactly what Shopify gives and Amazon withholds.

**❌ "Since Amazon is bigger, building on Shopify is the harder/worse choice."**
Reality: "Harder to start" (you supply the traffic) is not "worse." It buys ownership, branding, and the ability to build custom software — none of which Amazon offers a supplier.

---

## Frequently Asked Questions

**Q: If Amazon already has millions of shoppers, why would Himang ever choose Shopify?**
To *own* the business — the brand, the customer list, the checkout experience, and the data. On Amazon, Himang is a replaceable supplier inside someone else's store; a rival tiramisu is one click away. On Shopify, Himang builds a lasting, self-branded relationship with buyers.

**Q: Does Shopify bring me any customers at all?**
No. Shopify runs the store; it doesn't fill it. Discovery is entirely the merchant's job — SEO, ads, email, social. This is the single biggest difference in day-to-day operation.

**Q: Can a merchant use both Amazon and Shopify?**
Yes, and many do. Amazon for reach, Shopify to own the customers you can convert. There are even integrations to sync inventory across both — but that's an advanced topic; this course focuses on the Shopify store itself.

**Q: As an engineer, why does this course teach Shopify and not Amazon?**
Because Shopify gives you a full Admin API and webhooks over a store *you* control, which makes "build a production integration" a real project. Amazon's seller APIs are narrower and bounded by Amazon's marketplace rules — you're a supplier inside their system, not the owner of a store.

---

## Interview Questions

1. Define "marketplace" vs. "platform" and place Amazon and Shopify on each side.
2. Who owns the customer relationship in each model, and why does it matter to the business?
3. Shopify gives you a store but not shoppers. What does that imply for a merchant's costs and effort?
4. State the core trade-off between Amazon and Shopify in one sentence.
5. Why does the ownership model make a "Shopify integration" a meaningful engineering project, while an "Amazon integration" is more constrained?
6. Give a concrete reason a real merchant might use *both* Amazon and Shopify.

---

## Summary

- **Amazon is a marketplace; Shopify is a platform.** Amazon is one big store many suppliers sell inside; Shopify hands each merchant their own store.
- The dividing line is **ownership**: on Shopify, the merchant owns the customer, the brand, the checkout, and the data; on Amazon, Amazon keeps most of that.
- The core trade-off: **Amazon trades ownership for reach; Shopify trades reach for ownership.** Shopify gives you a store but makes you bring the traffic.
- This ownership model is *why* the rest of the course is possible: Customer objects, Draft Orders, the full Admin API, and webhooks all exist because the merchant owns the store.
- Using **both** is a common, rational strategy — Amazon for discovery, Shopify to own the relationship.

---

## What's Next

You now know what Shopify is and how it differs from the marketplace model most people picture. The last piece of foundation is the vocabulary of the people and places involved.

→ **Next chapter: Merchants, stores, and the admin** — who a "merchant" is, what a "store" actually is under the hood, and what the merchant does in the Admin dashboard. After that, [Section 02 — Shopify Data Model](../02-shopify-data-model/) introduces the objects: Products, Variants, Customers, and the Draft Order.
