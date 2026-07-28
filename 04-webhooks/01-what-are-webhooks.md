# What Are Webhooks, and Why?

Section 03 kept ending the same way: *"you'll find out via a webhook."* When Alice pays her invoice, when an order is fulfilled, when a product changes — your server needs to know, but nothing in the REST section told Shopify to *call you*. This section fixes that. It starts with the idea itself: what a webhook is, and why it beats the obvious alternative.

---

## Business Problem

Alice pays her invoice online (Path A from [Section 03, Ch. 06](../03-rest-api/06-completing-a-draft-order.md)). Shopify creates the order. Himang's fulfillment system needs to react — start baking, print a label. **How does Himang's server learn the order exists?**

The naive answer: *ask repeatedly.* Every 30 seconds, `GET /orders.json` and look for new ones. This is **polling**, and it's bad:

- **Wasteful.** 99% of polls return "nothing new." You burn API rate limit ([Section 10](../10-production/)) and CPU asking a question whose answer is usually "no."
- **Slow.** If you poll every 30 seconds, you learn of Alice's order up to 30 seconds late. Tighten the interval and the waste explodes.
- **Doesn't scale.** More stores, more objects, more frequent polls → a storm of mostly-empty requests.

Polling is asking "are we there yet?" on a loop. There's a better model: let Shopify **tell you** when something happens.

---

## Mental Model

> A **webhook** is a *reverse API call*: instead of your server calling Shopify, **Shopify calls your server** — an HTTP `POST` to a URL you registered — the moment an event happens.

The whole direction of control flips:

```
   NORMAL API (Section 03)            WEBHOOK (this section)

   Your Server ──request──► Shopify   Shopify ──POST event──► Your Server
   Your Server ◄─response── Shopify   Your Server ◄──200 OK── (you ack)

   You ask; Shopify answers.          Something happened; Shopify tells you.
```

Analogy: polling is repeatedly checking your mailbox to see if a package arrived. A webhook is the courier **ringing your doorbell** when it does. You register your address once; then you just answer the door.

The trade you're making:

> **Push, not pull.** You register interest once ("tell me about `orders/create`"), expose a URL, and react when Shopify knocks — instead of asking on a loop.

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

Two halves: a one-time **subscription** (which event, which URL), then ongoing **deliveries** whenever that event fires.

---

## What a webhook delivery looks like

When the event fires, Shopify sends an HTTP `POST` to your URL:

```
POST /webhooks/orders  HTTP/1.1
Host: your-server.example.com
Content-Type: application/json
X-Shopify-Topic: orders/create
X-Shopify-Shop-Domain: himangs-tiramisu.myshopify.com
X-Shopify-Hmac-Sha256: 9Xk3...==        ← a signature (chapters 03–04)

{ "id": 6001, "name": "#1001", "financial_status": "paid", ... }
```

- The **body** is the event's data — here, the order, in the same JSON shape you saw in Section 02/03.
- The **headers** carry metadata: which **topic** (event type), which **store**, and an **HMAC signature** proving it's genuinely from Shopify. That signature is the security heart of this section (Chapters 03–04); for now, just note it's there.

Your job on receipt: **respond `200 OK` quickly** to acknowledge, then do your work. If you don't ack (or you're down), Shopify **retries** later — a feature we'll lean on.

---

## Topics: the events you can subscribe to

Shopify emits webhooks for many event **topics**, named `resource/event`. The ones this course cares about:

| Topic | Fires when | Why you'd want it |
|-------|-----------|-------------------|
| `orders/create` | An order is created (incl. paid invoice — Path A) | Learn a sale happened; start fulfillment |
| `orders/paid` | An order becomes paid | Trigger paid-only workflows |
| `orders/fulfilled` | An order is fulfilled | Notify the customer / downstream systems |
| `draft_orders/update` | A draft order changes | Track a draft through its lifecycle |
| `products/update` | A product changes | Keep a local catalog cache fresh |
| `customers/data_request`, `customers/redact`, `shop/redact` | Privacy/GDPR events | **Mandatory** for public apps ([Section 09](../09-authentication/)) |

You subscribe only to what you need. Each subscription is one topic → one URL.

---

## Two ways to subscribe

You register webhook subscriptions in one of two ways:

- **In the Shopify admin / app config** — click-configure a topic and URL. Fine for static, store-specific setups.
- **Over the Admin API** — `POST /webhooks.json` with a topic and address. This is how apps subscribe programmatically (and reuses the exact auth pattern from [Section 03, Ch. 01](../03-rest-api/01-authentication-and-access-tokens.md)):

```
POST /admin/api/2024-10/webhooks.json
{ "webhook": { "topic": "orders/create",
               "address": "https://your-server.example.com/webhooks/orders",
               "format": "json" } }
```

Either way, the result is the same: Shopify now knows to `POST` you when that topic fires.

---

## Production Considerations

- **Acknowledge fast, work async.** Return `200` within Shopify's timeout, *then* do slow work (queue it). Doing heavy processing before responding risks a timeout and a retry storm.
- **Expect retries → be idempotent.** Shopify retries failed/no-ack deliveries, and can occasionally deliver the same event more than once. Handle duplicates safely (e.g. dedupe on the event/order id). This theme recurs from Section 03 for a reason.
- **Verify every webhook.** An open `POST` endpoint is a target. Anyone could `POST` fake "orders" to it. You **must** verify the HMAC signature before trusting the body — Chapters 03–04.
- **Webhooks are not guaranteed exactly-once, or even at-least-once forever.** Deliveries can be missed (prolonged downtime, repeated failures → auto-removal). Keep a reconciliation path (occasional read) as a backstop, not as the primary mechanism.
- **Order isn't guaranteed.** You might get `orders/paid` before `orders/create` in edge cases. Don't assume strict ordering.

---

## Common Misconceptions

**❌ "I'll just poll the API to stay in sync."**
Reality: Polling is wasteful, slow, and doesn't scale. Webhooks push events to you as they happen. Use polling only as an occasional backstop.

**❌ "A webhook is something my server sends to Shopify."**
Reality: It's the reverse — *Shopify* sends the HTTP `POST` to *your* server. It's an inbound call you receive.

**❌ "If I subscribe, I'll get every event exactly once, forever."**
Reality: Deliveries can be duplicated, retried, missed, or out of order. Build idempotent handlers and a reconciliation backstop.

**❌ "I can trust the webhook body because it came to my secret URL."**
Reality: A URL isn't a secret. You must verify the **HMAC signature** to know the request is really from Shopify (Chapters 03–04).

**❌ "I should do all my processing before replying."**
Reality: Acknowledge with `200` fast, then process asynchronously. Slow handlers cause timeouts and retries.

---

## Frequently Asked Questions

**Q: Why not just poll? It's simpler.**
Simpler to write, worse in every other way: wasted requests against your rate limit, delayed reactions, and poor scaling. Webhooks give near-real-time updates with almost no wasted traffic. Polling is a fallback, not the plan.

**Q: What exactly does my server receive?**
An HTTP `POST` with a JSON body (the event's object) and headers giving the topic, the shop domain, and an HMAC signature. You respond `200 OK` to acknowledge.

**Q: What happens if my server is down when an event fires?**
Shopify retries delivery for a while. If it keeps failing over a long period, the subscription can be removed. That's why a reconciliation backstop matters for critical data.

**Q: How is this different from the REST API I just learned?**
Same HTTP, opposite direction. In Section 03 *you* called *Shopify*. A webhook is *Shopify* calling *you*. The auth also flips: instead of you sending a token, Shopify signs the request and you verify it.

**Q: Which events should I subscribe to for the draft-order pipeline?**
At minimum `orders/create` (to catch Path A completions) and probably `orders/paid` and `orders/fulfilled`. Subscribe to what your workflow reacts to.

---

## Interview Questions

1. What is a webhook, and how does its direction differ from a normal API call?
2. Give three concrete reasons polling is worse than webhooks.
3. What does a webhook delivery contain (body and key headers)?
4. What should your handler do first on receiving a webhook, and why?
5. Why must webhook handlers be idempotent?
6. Are webhook deliveries guaranteed exactly-once and in order? What follows from the answer?
7. Why is verifying the request essential, and what proves authenticity?

---

## Summary

- A **webhook** is a **reverse API call**: Shopify **POSTs your server** when an event happens, instead of you polling. Push, not pull.
- It solves the sync problem Section 03 kept deferring — e.g. learning that Alice's **`orders/create`** happened after she paid online.
- A delivery is a `POST` with a **JSON body** (the event object) and **headers** (topic, shop domain, **HMAC signature**); you reply **`200 OK`** fast to acknowledge.
- You **subscribe** per **topic** (`orders/create`, `orders/paid`, …) to a URL, via the admin or `POST /webhooks.json`.
- Deliveries can be **duplicated, retried, missed, or reordered**, so handlers must be **idempotent** with a **reconciliation backstop** — and every webhook **must be verified** (next chapters).

---

## What's Next

To receive a webhook, Shopify has to reach your server over the public internet — but during development your server is on `localhost`, which Shopify can't see.

→ **Next chapter: [Local development with ngrok](02-local-development-with-ngrok.md)** — why Shopify can't call `localhost`, and how a tunnel lets you test webhooks on your own machine.
