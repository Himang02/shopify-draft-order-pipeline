# Shopify from First Principles

> A book-quality learning repository that teaches Shopify to backend engineers from the ground up.

Not API docs, not a pile of notes — a **structured course**. A backend developer who has never touched Shopify can start at the top and, by the end, build production-grade integrations without any other resource.

---

## Who this is for

Assumes you know: programming, backend development, HTTP, REST, databases, JSON, and Node.js / Express.

Assumes you know **nothing** about Shopify, ecommerce, products, variants, draft orders, orders, checkouts, payments, fulfillment, apps, GraphQL, webhooks, OAuth, Polaris, or Liquid. Every Shopify concept is introduced before it's used.

---

## How to read this course

Read the sections in order — each builds on the last. Every chapter follows the same rhythm: **Business Problem → Mental Model → Architecture (ASCII) → Internal Working → REST → GraphQL → Production Considerations → Common Misconceptions → FAQ → Interview Questions → Summary → What's Next.**

---

## The running example

One imaginary store runs through the whole course:

- **Store:** Himang's Tiramisu
- **Products:** Classic, Chocolate, Matcha Tiramisu
- **Customers:** Alice, Bob

Every product or customer in an example is one of these.

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
