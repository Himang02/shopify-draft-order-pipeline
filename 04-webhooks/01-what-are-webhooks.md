# What Are Webhooks, and Why?

Section 03 kept saying *"you'll find out via a webhook."* When Alice pays, when an order ships — your server needs to know, but nothing in REST told Shopify to *call you*. This section fixes that, starting with what a webhook is and why it beats the obvious alternative.

---

## Business Problem

Alice pays her invoice online (Path A, [Section 03, Ch. 06](../03-rest-api/06-completing-a-draft-order.md)). Shopify creates the order. Himang's system needs to react — start baking, print a label. **How does his server learn the order exists?**

The naive answer: *ask repeatedly.* Every 30 seconds, `GET /orders.json` and look for new ones. This is **polling**, and it's bad:

- **Wasteful** — 99% of polls return "nothing new," burning rate limit and CPU.
- **Slow** — you learn of the order up to 30 seconds late; tighten the interval and waste explodes.
- **Doesn't scale** — more stores/objects → a storm of empty requests.

There's a better model: let Shopify **tell you** when something happens.

---

## Mental Model

> A **webhook** is a *reverse API call*: instead of your server calling Shopify, **Shopify calls your server** — an HTTP `POST` to a URL you registered — the moment an event happens.

The direction of control flips:

```
   NORMAL API (Section 03)            WEBHOOK (this section)

   Your Server ──request──► Shopify   Shopify ──POST event──► Your Server
   Your Server ◄─response── Shopify   Your Server ◄──200 OK── (you ack)

   You ask; Shopify answers.          Something happened; Shopify tells you.
```

Analogy: polling is checking your mailbox on a loop; a webhook is the courier **ringing your doorbell**. Register your address once, then answer the door.

> **Push, not pull.** Register interest once, expose a URL, react when Shopify knocks.

---

## Architecture

```
   1. REGISTER (once)
      Your Server ──"POST me at https://.../webhooks/orders when orders/create"──► Shopify

   2. EVENT HAPPENS
      Alice pays  →  Shopify creates order 6001

   3. DELIVERY
      Shopify ──POST https://.../webhooks/orders (order JSON)──► Your Server
      Your Server ──200 OK──► Shopify        (acknowledge fast)

   4. YOU REACT
      start baking, print label, sync to your DB ...
```

Two halves: a one-time **subscription** (which event, which URL), then ongoing **deliveries**.

---

## What a delivery looks like

```
POST /webhooks/orders  HTTP/1.1
Host: your-server.example.com
Content-Type: application/json
X-Shopify-Topic: orders/create
X-Shopify-Shop-Domain: himangs-tiramisu.myshopify.com
X-Shopify-Hmac-Sha256: 9Xk3...==        ← a signature (chapters 03–04)

{ "id": 6001, "name": "#1001", "financial_status": "paid", ... }
```

- The **body** is the event's data (the order, in the JSON shape from Section 02/03).
- The **headers** give the **topic**, the **store**, and an **HMAC signature** proving it's from Shopify (the security heart of this section, Chapters 03–04).

Your job on receipt: **respond `200 OK` fast** to acknowledge, then do the work. If you don't ack, Shopify **retries**.

---

## Topics: events you can subscribe to

Topics are named `resource/event`. The ones this course cares about:

| Topic | Fires when | Why |
|-------|-----------|-------------------|
| `orders/create` | An order is created (incl. paid invoice — Path A) | Learn a sale happened; start fulfillment |
| `orders/paid` | An order becomes paid | Trigger paid-only workflows |
| `orders/fulfilled` | An order is fulfilled | Notify the customer / downstream |
| `draft_orders/update` | A draft order changes | Track a draft's lifecycle |
| `products/update` | A product changes | Keep a local catalog cache fresh |
| `customers/data_request`, `customers/redact`, `shop/redact` | Privacy/GDPR events | **Mandatory** for public apps ([Section 09](../09-authentication/)) |

Subscribe only to what you need — one topic → one URL.

---

## Two ways to subscribe

- **Admin / app config** — click-configure a topic and URL. Fine for static setups.
- **Admin API** — `POST /webhooks.json` (reusing the auth from [Section 03, Ch. 01](../03-rest-api/01-authentication-and-access-tokens.md)):

```
POST /admin/api/2024-10/webhooks.json
{ "webhook": { "topic": "orders/create",
               "address": "https://your-server.example.com/webhooks/orders",
               "format": "json" } }
```

Either way, Shopify now knows to `POST` you when the topic fires.

---

## Production Considerations

- **Acknowledge fast, work async** — return `200` within the timeout, then do slow work (queue it), or you risk a retry storm.
- **Expect retries → be idempotent** — Shopify retries and can deliver the same event twice. Dedupe on the event/order id.
- **Verify every webhook** — an open `POST` endpoint is a target; anyone could send fake "orders." Verify the HMAC before trusting the body (Chapters 03–04).
- **Deliveries aren't guaranteed forever** — prolonged failures can drop a subscription. Keep a reconciliation backstop (occasional read).
- **Order isn't guaranteed** — you might get `orders/paid` before `orders/create`. Don't assume strict ordering.

---

## Common Misconceptions

**❌ "I'll just poll to stay in sync."**
Polling is wasteful, slow, and doesn't scale. Webhooks push events as they happen; poll only as a backstop.

**❌ "A webhook is something my server sends to Shopify."**
The reverse — *Shopify* POSTs *your* server. It's inbound.

**❌ "If I subscribe, I'll get every event exactly once, forever."**
Deliveries can be duplicated, retried, missed, or reordered. Build idempotent handlers + a backstop.

**❌ "I can trust the body because it came to my secret URL."**
A URL isn't a secret. Verify the **HMAC signature** (Chapters 03–04).

**❌ "I should do all processing before replying."**
Ack `200` fast, then process async. Slow handlers cause retries.

---

## Frequently Asked Questions

**Q: Why not just poll?**
Simpler to write, worse in every other way — wasted requests, delayed reactions, poor scaling. Webhooks are near-real-time with almost no waste. Polling is a fallback.

**Q: What does my server receive?**
A `POST` with a JSON body (the event object) and headers giving the topic, shop domain, and HMAC signature. Reply `200 OK`.

**Q: What if my server is down when an event fires?**
Shopify retries for a while; prolonged failure can drop the subscription. Hence the reconciliation backstop.

**Q: How is this different from the REST API?**
Same HTTP, opposite direction. In Section 03 *you* called *Shopify*; a webhook is *Shopify* calling *you*. Auth flips too: Shopify signs, you verify.

**Q: Which topics for the draft-order pipeline?**
At least `orders/create` (Path A completions), plus `orders/paid` and `orders/fulfilled`.

---

## Interview Questions

1. What is a webhook, and how does its direction differ from a normal API call?
2. Give three reasons polling is worse.
3. What does a delivery contain (body + key headers)?
4. What should your handler do first, and why?
5. Why must handlers be idempotent?
6. Are deliveries exactly-once and ordered? What follows?
7. Why verify the request, and what proves authenticity?

---

## Summary

- A **webhook** is a **reverse API call**: Shopify **POSTs your server** on an event, instead of you polling.
- It solves the sync problem Section 03 deferred — e.g. learning of `orders/create` after Alice pays.
- A delivery is a `POST` with a **JSON body** and **headers** (topic, shop domain, **HMAC signature**); reply **`200 OK`** fast.
- **Subscribe** per **topic** to a URL, via the admin or `POST /webhooks.json`.
- Deliveries can be **duplicated, retried, missed, or reordered**, so handlers must be **idempotent** with a **backstop** — and every webhook **must be verified**.

---

## What's Next

To receive a webhook, Shopify must reach your server — but in development it's on `localhost`, which Shopify can't see.

→ **Next: [Local development with ngrok](02-local-development-with-ngrok.md)** — why `localhost` is unreachable, and how a tunnel fixes it.
