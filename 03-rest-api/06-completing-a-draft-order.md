# Completing a Draft Order → Order

The final step. The draft is priced and Alice can pay. Here the draft **becomes a real Order** — where `order_id` stops being `null`. The concrete form of the [draft-order lifecycle](../02-shopify-data-model/04-draft-orders.md), over REST.

---

## Business Problem

Alice pays. Himang needs a *real order* — one that counts as revenue and can be fulfilled. How the draft completes depends on how she paid:

- **Online** via the invoice link → Shopify completes it automatically.
- **Out-of-band** (cash, card machine, bank transfer) → Himang completes it manually and marks it paid.

Both end the same: a new Order, linked to the now-`completed` draft.

---

## Mental Model

The two paths, as concrete actions:

> **Path A — customer pays the invoice.** Alice completes the checkout; Shopify creates the order and marks the draft `completed`. *You call nothing* — you learn of it via a webhook.
>
> **Path B — you complete it directly.** `PUT /draft_orders/{id}/complete.json`. Shopify creates the order immediately; you choose paid or pending.

And the anchoring fact:

> Completing a draft **creates a separate Order.** The draft isn't renamed — it becomes `completed` and its `order_id` points at the new order. **Two linked objects.**

---

## Architecture

```
  Path A (online payment)                Path B (manual completion)

  Alice pays via invoice_url             PUT /draft_orders/5001/complete.json
        │                                        │
        ▼                                        ▼
  Shopify auto-completes            Shopify completes the draft
        │                                        │
        └───────────────┬────────────────────────┘
                        ▼
        DRAFT ORDER 5001  status: completed,  order_id: 6001
                        │
                        ▼
        new ORDER 6001  (financial_status set, fulfillment_status: null)
                        │
                        ▼
        you learn of it via webhook  →  orders/create  (Section 04)
```

---

## REST Implementation

### Path B — complete directly

```
PUT /admin/api/2024-10/draft_orders/5001/complete.json
```

A query parameter controls the money axis:

- **`?payment_pending=false`** (default) — mark the order **paid** (payment already collected out-of-band).
- **`?payment_pending=true`** — create it **pending/unpaid** (net-terms wholesale, collect later).

```
PUT /admin/api/2024-10/draft_orders/5001/complete.json?payment_pending=false
```

The response — the draft, completed and linked:

```json
{
  "draft_order": { "id": 5001, "status": "completed", "order_id": 6001, "invoice_url": "..." }
}
```

**`order_id: 6001`** — the `null` from Chapter 04 is now a real order. Fetch it:

```
GET /admin/api/2024-10/orders/6001.json
→ financial_status: "paid",  fulfillment_status: null,  name: "#1001"
```

Everything from the [order chapter](../02-shopify-data-model/05-orders-and-the-order-lifecycle.md) is now live: two status axes, snapshotted prices, an order number.

### Path A — customer pays online

**No call to make.** Alice completing the checkout makes Shopify complete the draft and create the order. Your server finds out via a **webhook** (`orders/create`) — which is why Section 04 is next. Don't poll; subscribe.

### Runnable example (Path B)

```javascript
// complete-draft-order.js — complete a draft order into a real order (Path B).
// Introduced in: 03-rest-api/06-completing-a-draft-order.md
// Node 18+.  Env: SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN, DRAFT_ORDER_ID

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API = "2024-10";

async function shopify(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/${API}/${path}`, {
    method,
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}\n${await res.text()}`);
  }
  return res.json();
}

const DRAFT_ID = Number(process.env.DRAFT_ORDER_ID || 5001);

async function main() {
  if (!SHOP || !TOKEN) throw new Error("Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN.");

  // Mark as paid (payment already collected out-of-band).
  const { draft_order } = await shopify(
    `draft_orders/${DRAFT_ID}/complete.json?payment_pending=false`,
    { method: "PUT" }
  );
  console.log(`Draft ${draft_order.id} → status: ${draft_order.status}`);
  console.log(`  order_id is now: ${draft_order.order_id}`); // was null before!

  // Inspect the freshly created order.
  const { order } = await shopify(`orders/${draft_order.order_id}.json`);
  console.log(`Order ${order.name} (id ${order.id})`);
  console.log(`  financial_status:   ${order.financial_status}`);
  console.log(`  fulfillment_status: ${order.fulfillment_status}`); // null = unfulfilled
  console.log(`  total: ₹${order.total_price}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
```

Copy in [`examples/complete-draft-order.js`](../examples/complete-draft-order.js).

---

## GraphQL Implementation

The `draftOrderComplete` mutation (Section 05):

```graphql
mutation {
  draftOrderComplete(id: "gid://shopify/DraftOrder/5001", paymentPending: false) {
    draftOrder { id status order { id name displayFinancialStatus } }
    userErrors { field message }
  }
}
```

GraphQL can return the **new order inline** (`draftOrder.order { … }`) — handy versus REST's "read `order_id`, then `GET` the order." Same `paymentPending` choice; check `userErrors`.

---

## Production Considerations

- **Completion is the revenue moment** — record the sale here, not at draft creation or invoice send.
- **Handle Path A with idempotent webhooks** — `orders/create` can arrive more than once. Don't build a polling loop.
- **Choose `payment_pending` deliberately** — paid vs pending sets the financial axis; marking something paid that wasn't corrupts your books.
- **Completion is (mostly) one-way** — you can't un-complete; corrections happen on the *order* via refunds/cancellations.
- **Completion can fail** — an out-of-stock/invalid variant errors (REST) or shows `userErrors` (GraphQL). Handle it.
- **Don't double-complete** — check the draft's status first, to guard against retries.

---

## Common Misconceptions

**❌ "Completing renames the draft into an order."**
It **creates a separate order** and marks the draft `completed`, linked by `order_id`. Two objects.

**❌ "For online payment, I call complete myself."**
Path A is automatic; you learn of the order via webhook. You call `complete` only for Path B.

**❌ "`payment_pending` doesn't matter much."**
It sets the financial status (paid vs pending) — directly affecting your revenue records.

**❌ "I'll poll the draft to see when it's paid."**
Use webhooks. Polling is wasteful and racy.

**❌ "After completion I can still edit freely."**
The draft is frozen at `completed`; the order is committed history.

---

## Frequently Asked Questions

**Q: After completion, how many objects exist?**
Two — the draft (`completed`, `order_id` set) and the new order. Linked, not merged.

**Q: When do I call `complete` vs. do nothing?**
Call it (Path B) for out-of-band payment you record manually. Do nothing (Path A) when the customer paid online.

**Q: What does `payment_pending` do?**
`false` → order marked **paid**; `true` → **pending** (collect later). It sets the financial status.

**Q: The order shows `fulfillment_status: null` — did fulfillment fail?**
No — `null` = unfulfilled, the normal start. Fulfillment is a separate step.

**Q: Can completion fail?**
Yes — e.g. out-of-stock variant. REST errors; GraphQL returns `userErrors`. Handle it.

---

## Interview Questions

1. What does completing a draft create, and what happens to the draft?
2. Contrast the two paths and who initiates each.
3. What's the significance of `order_id` changing from `null`?
4. What does `payment_pending` control, and why does it matter?
5. For online payment, how does your server learn the order exists?
6. Why is completion the right moment to record revenue?

---

## Summary

- Completing a draft **creates a separate Order** and marks the draft **`completed`**, linked via **`order_id`**.
- **Path A (online):** customer pays, Shopify auto-completes, you learn via a **webhook** — no call.
- **Path B (manual):** **`PUT /draft_orders/{id}/complete.json`** with **`payment_pending`** choosing paid vs pending.
- **Completion is the revenue moment** and essentially one-way; the order carries the two status axes, snapshotted prices, and a number.
- GraphQL's `draftOrderComplete` can return the order inline; both surfaces fail via errors / `userErrors`.

---

## What's Next

**That completes the REST pipeline** — auth → products → customers → draft order → invoice → completion.

But this section kept saying *"you'll learn of that via a webhook."* Your server needs Shopify to call *it*.

→ **Next: [Section 04 — Webhooks](../04-webhooks/).** How Shopify notifies your server, and how to verify those calls are genuinely from Shopify.
