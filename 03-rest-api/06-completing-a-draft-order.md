# Completing a Draft Order → Order

The final step of the pipeline. The draft is priced and Alice has a way to pay. This chapter is where the draft order **becomes a real Order** — where `order_id` stops being `null`. It's the concrete form of the [draft-order lifecycle](../02-shopify-data-model/04-draft-orders.md), over REST.

---

## Business Problem

Alice pays. Now Himang needs a *real order* — one that counts as revenue, appears in reports, and can be fulfilled. But "how" the draft completes depends on *how* Alice paid:

- She paid **online** via the invoice link → Shopify completes it automatically.
- She paid **out-of-band** (cash on delivery, a card machine, bank transfer) → Himang completes it manually and tells Shopify it's paid.

Both paths end with the same thing: a new Order, linked to the now-`completed` draft.

---

## Mental Model

Recall the two paths (Section 02, Ch. 04), now named as concrete actions:

> **Path A — customer pays the invoice.** Alice completes the hosted checkout; Shopify creates the order and marks the draft `completed`. *You don't call anything* — you find out via a webhook.
>
> **Path B — you complete it directly.** `PUT /draft_orders/{id}/complete.json`. Shopify creates the order immediately. You choose whether to mark it paid or pending.

And the fact that anchors the whole repository:

> Completing a draft **creates a separate Order object.** The draft isn't renamed — it becomes `completed` and its `order_id` points at the new order. **Two linked objects.**

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

A key query parameter controls the money axis (Section 02, Ch. 05):

- **`?payment_pending=false`** (default) — mark the order **paid**. Use when payment already happened out-of-band (cash received, card machine charged).
- **`?payment_pending=true`** — create the order as **pending/unpaid**. Use for net-terms wholesale where you'll collect later.

```
PUT /admin/api/2024-10/draft_orders/5001/complete.json?payment_pending=false
```

The response is the draft, now completed and linked:

```json
{
  "draft_order": {
    "id": 5001,
    "status": "completed",
    "order_id": 6001,
    "invoice_url": "..."
  }
}
```

**`order_id: 6001`** — there it is. The `null` from Chapter 04 is now the ID of a real order. Fetch it to see the committed sale:

```
GET /admin/api/2024-10/orders/6001.json
→ financial_status: "paid",  fulfillment_status: null,  name: "#1001"
```

Everything from the [order chapter](../02-shopify-data-model/05-orders-and-the-order-lifecycle.md) is now live: two status axes, snapshotted prices, an order number.

### Path A — customer pays online

There's **no call to make.** Alice completing the hosted checkout causes Shopify to complete the draft and create the order. Your server finds out through a **webhook** (`orders/create`), which is exactly why Section 04 comes next. Polling the draft in a loop is the wrong instinct; subscribe to the event.

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

A copy lives in [`examples/complete-draft-order.js`](../examples/complete-draft-order.js).

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

Note GraphQL can return the **new order inline** (`draftOrder.order { … }`) in the same response — handy versus REST's "read `order_id`, then `GET` the order." Same `paymentPending` choice; check `userErrors`.

---

## Production Considerations

- **Completion is the revenue moment.** *Now* it's a sale — record it here, not at draft creation or invoice send.
- **Handle Path A with idempotent webhooks.** `orders/create` can arrive more than once; make handling safe to repeat (Section 04). Don't build a polling loop.
- **Choose `payment_pending` deliberately.** `false` (paid) vs `true` (pending) sets the order's financial axis. Marking something paid that wasn't collected corrupts your books.
- **Completion is (mostly) one-way.** A completed draft has produced an order; you can't un-complete it. Corrections happen on the *order* via refunds/cancellations (Section 02, Ch. 05).
- **Watch inventory and errors at completion.** Stock is committed at completion; a variant that went out of stock, or is now invalid, can make completion fail (REST error / GraphQL `userErrors`). Handle it.
- **Don't double-complete.** Guard against completing the same draft twice from retries — check its status first.

---

## Common Misconceptions

**❌ "Completing renames the draft into an order."**
Reality: It **creates a separate order** and marks the draft `completed`, linked by `order_id`. Two objects.

**❌ "For online payment, I call complete myself."**
Reality: Path A is automatic on payment; you learn of the order via a webhook. You only call `complete` for Path B (manual).

**❌ "`payment_pending` doesn't matter much."**
Reality: It sets the order's financial status (paid vs pending). It directly affects your revenue records — choose correctly.

**❌ "I'll poll the draft to see when it's paid."**
Reality: Use webhooks. Polling is wasteful and racy; Shopify pushes `orders/create`/`orders/paid` when it happens.

**❌ "After completion I can still edit the draft/order freely."**
Reality: The draft is frozen at `completed`; the order is committed history, changed only via refunds/edits/cancellations.

---

## Frequently Asked Questions

**Q: After I complete a draft, how many objects exist?**
Two: the draft (now `completed`, `order_id` populated) and the new order it created. They're linked, not merged.

**Q: When do I call `complete` vs. do nothing?**
Call `complete` (Path B) when payment happened out-of-band and you're recording it manually. Do nothing (Path A) when the customer paid online — Shopify completes it and a webhook tells you.

**Q: What does `payment_pending` do?**
`false` creates the order marked **paid**; `true` creates it **pending** (unpaid), for collect-later terms. It sets the order's financial status.

**Q: The completed order shows `fulfillment_status: null`. Did fulfillment fail?**
No — `null` means unfulfilled, the normal starting state (Section 02, Ch. 05). Fulfillment is a separate, later step.

**Q: Can completion fail?**
Yes — e.g. an out-of-stock or invalid variant. REST returns an error; GraphQL returns `userErrors`. Handle it rather than assuming success.

---

## Interview Questions

1. What does completing a draft order create, and what happens to the draft itself?
2. Contrast the two completion paths and who initiates each.
3. What is the significance of `order_id` changing from `null` to a value?
4. What does the `payment_pending` parameter control, and why does it matter for your books?
5. For online payment, how does your server learn the order exists?
6. Why is completion the right moment to record revenue?

---

## Summary

- Completing a draft order **creates a separate Order** and marks the draft **`completed`**, linked via **`order_id`** (no longer `null`).
- **Path A (online):** the customer pays the invoice, Shopify auto-completes, and you learn of the order via a **webhook** (`orders/create`) — no call needed.
- **Path B (manual):** **`PUT /draft_orders/{id}/complete.json`**, with **`payment_pending`** choosing paid (`false`) vs pending (`true`).
- **Completion is the revenue moment** and is essentially one-way; the resulting order carries the two status axes, snapshotted prices, and an order number (Section 02, Ch. 05).
- GraphQL's `draftOrderComplete` can return the new order inline; both surfaces can fail (errors / `userErrors`) if e.g. stock ran out.

---

## What's Next

**That completes the REST pipeline** — from an authenticated call to a real, paid order, entirely over HTTP. You've built the whole thing: auth → products → customers → draft order → invoice → completion.

But notice how often this section said *"you'll learn of that via a webhook."* Path A completion, `orders/paid`, fulfillment updates — your server needs Shopify to call *it*. That's the next section.

→ **Next: [Section 04 — Webhooks](../04-webhooks/).** How Shopify notifies your server of events, and how to verify those calls are genuinely from Shopify.
