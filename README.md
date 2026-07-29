# Shopify from First Principles

> A book-quality learning repository that teaches Shopify to backend engineers from the ground up.

This is not API documentation. It is not a pile of notes.

It is a **structured course**. If you are a backend developer who has never touched Shopify, you can start at the top and, by the end, understand Shopify well enough to build production-grade integrations — without needing any other resource.

---

## Who this is for

This course assumes you already know:

- Programming
- Backend development
- HTTP
- REST APIs
- Databases
- JSON
- Node.js / Express

It assumes you know **nothing** about Shopify, ecommerce, products, variants, draft orders, orders, checkouts, payments, fulfillment, apps, GraphQL, webhooks, OAuth, Polaris, or Liquid.

Every Shopify concept is introduced before it is used.

---

## How to read this course

Read the sections in order. Each one builds on the last.

Every chapter follows the same rhythm, so you always know what to expect:

1. **Business Problem** — the real-world situation that forced this concept to exist.
2. **Mental Model** — the concept explained with an analogy, no code.
3. **Architecture** — an ASCII diagram of how the pieces fit.
4. **Internal Working** — who creates it, who owns it, what happens next.
5. **REST Implementation** — the endpoint, headers, body, response, field by field.
6. **GraphQL Implementation** — the same thing in GraphQL, and why it differs.
7. **Production Considerations** — pitfalls, security, scaling, best practices.
8. **Common Misconceptions**, **FAQ**, **Interview Questions**, **Summary**, **What's Next**.

We optimize for *understanding*, never for shorter documentation.

---

## The running example

To keep everything concrete, one imaginary store is used throughout the entire course:

**Store:** Himang's Tiramisu

**Products:**
- Classic Tiramisu
- Chocolate Tiramisu
- Matcha Tiramisu

**Customers:**
- Alice
- Bob

Whenever you see a product or a customer in an example, it will be one of these.

---

## Table of Contents

| # | Section | What you'll learn |
|---|---------|-------------------|
| 01 | [Introduction](01-introduction/) | What Shopify is, Shopify vs Amazon, the merchant/store mental model |
| 02 | [Shopify Data Model](02-shopify-data-model/) | Product vs Variant, Customer, Draft Order, Order, Checkout, Invoice, Payment vs Fulfillment |
| 03 | [REST Admin API](03-rest-api/) | Auth, products, customers, creating & completing Draft Orders, invoice URLs |
| 04 | [Webhooks](04-webhooks/) | ngrok, Express, raw vs JSON bodies, HMAC verification, replay attacks |
| 05 | [GraphQL](05-graphql/) | Queries, mutations, global IDs, connections, pagination, userErrors |
| 06 | [App Architecture](06-app-architecture/) | How Shopify apps are structured and hosted |
| 07 | [Payments](07-payments/) | How money actually moves |
| 08 | [Checkout](08-checkout/) | The checkout lifecycle |
| 09 | [Authentication](09-authentication/) | Access tokens, API keys/secrets, OAuth |
| 10 | [Production](10-production/) | Deployment, scaling, best practices |
| 11 | [Assignments](11-assignments/) | Exercises to test your understanding |

Supporting folders:

- [`app/`](app/) — a small, runnable **mini admin UI** (HTML/CSS + Express) that ties the pipeline together: view products & variants, find-or-create customers, create draft orders, mark them paid, view orders, and receive verified webhooks.
- [`examples/`](examples/) — runnable Node.js / Express code referenced by the chapters.
- [`assets/`](assets/) — diagrams and images.

---

## Learning Roadmap

The course is designed to be read in phases. Each phase is a plateau where new concepts click into place.

**Phase 1 — The vocabulary.** What is Shopify? Merchant, Store, Product, Variant, Customer, Draft Order, Order, Checkout, Invoice, Payment, Fulfillment. *(Sections 01–02)*

**Phase 2 — The platform.** Admin, Admin API, Storefront API, Apps, Access Tokens, API Keys, Secrets, Webhook Secrets. *(Sections 03, 09)*

**Phase 3 — REST in practice.** Authentication, Products, Customers, Draft Orders, completing Draft Orders, Invoice URLs. *(Section 03)*

**Phase 4 — Webhooks.** Why webhooks, ngrok, `express.raw()`, HMAC, SHA-256, `timingSafeEqual`, replay attacks. *(Section 04)*

**Phase 5 — GraphQL.** Why GraphQL, queries, mutations, variables, global IDs, connections, nodes, edges, pagination, userErrors, fragments. *(Section 05)*

**Phase 6 — Production.** OAuth, app architecture, checkout, payments, fulfillment, deployment, scaling, best practices. *(Sections 06–10)*

---

## A note on the learning journey

This repository deliberately preserves the *actual* journey of learning Shopify — including beginner questions, misconceptions, and the "aha" moments that resolved them. If a question ever helped clarify something, it stays in the docs. Confusion is a teaching asset here, not something to hide.

Start with **[01 — Introduction](01-introduction/)**.
