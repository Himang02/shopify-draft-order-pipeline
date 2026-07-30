# Orders and the Order Lifecycle

The [Draft Order chapter](04-draft-orders.md) ended where a draft completes and "a real Order is created." This chapter is about that Order — and the part that matters most: its life is tracked along **two independent axes**.

One idea to take away: **payment and fulfillment are separate.** An Order tracks them separately, on purpose.

---

## Business Problem

Alice paid for her two Large Classic Tiramisus. Now Himang manages a *real sale*, answering distinct questions over the next days:

- **Did we get the money?** (Yes, card.)
- **Have we shipped?** (Not yet — ships Friday.)
- **What if she refunds a box?** (The money answer changes; the shipping answer might not.)

These are *different* questions with *different* answers at the *same* moment: **paid, but not shipped.** A single "order status" can't capture that — money and goods move on their own schedules.

The Order object solves this: it's the committed record of the sale, tracking *money* and *goods* as two separate storylines.

---

## Mental Model

> An **Order** is Shopify's record of a *committed sale* — what, by whom, for how much — plus two status lines: one for **payment**, one for **fulfillment**.

Two anchors:

1. **An Order is the "after"; the Draft Order was the "before."** The draft was editable; the Order is a record of something that *happened* — stable, changed only via refunds/edits/cancellations. Think *receipt*, not *shopping list*.
2. **Two axes, not one:**
   - **financial status** — where the *money* stands (unpaid, paid, refunded…).
   - **fulfillment status** — where the *goods* stand (unfulfilled, partial, fulfilled…).

   They move independently. "Paid + unfulfilled" is normal; so is "fulfilled + unpaid" (shipped on trust). One field couldn't express both.

```
   ORDER  (a committed sale)
        │
        ├── financial status ──►  the MONEY story  (Transactions)
        └── fulfillment status ─►  the GOODS story  (Fulfillments)
```

This is the concrete "payment ≠ fulfillment" idea from [Section 01](../01-introduction/02-shopify-vs-amazon.md) — two fields on the Order.

---

## How an Order comes to exist

**You usually don't create Orders — Shopify does.** Two normal births:

```
   Shopper-driven:                    Merchant-driven:
   shopper completes CHECKOUT         merchant completes a DRAFT ORDER
            │                                   │
            └──────────────┬────────────────────┘
                           ▼
                   Shopify creates an ORDER
```

- **From a checkout** — a shopper pays; Shopify produces the Order ([Section 08](../08-checkout/)).
- **From a Draft Order completion** — this repo's flow.

A REST endpoint to `POST` an order directly exists but is for special cases (importing history). Normally **Orders arrive from checkouts and draft completions** — which is why you learn of them via **webhooks** rather than creating them.

---

## The two status axes

Each axis is a small state machine.

### Financial status — the money

| Status | Meaning |
|--------|---------|
| `pending` | Payment initiated, not confirmed. |
| `authorized` | Funds held but **not yet captured** — money not in the account. |
| `paid` | Captured — money collected. |
| `partially_paid` | Some, not all, paid. |
| `refunded` / `partially_refunded` | Fully / partly refunded. |
| `voided` | Authorization cancelled before capture. |

**`authorized` vs `paid`** matters ([Section 07](../07-payments/)): authorize = "reserved the money"; capture = "actually took it." Two possible steps.

### Fulfillment status — the goods

| Status | Meaning |
|--------|---------|
| `null` (unfulfilled) | Nothing shipped. **`null` is normal**, not an error. |
| `partial` | Some line items shipped. |
| `fulfilled` | Everything shipped. |
| `restocked` | Items returned to inventory. |

Common gotcha: `fulfillment_status: null` isn't a bug — it means "not shipped yet."

### Why they're independent

Alice's order over four days:

```
   Day 0  Draft completed, Alice paid
          financial: paid        fulfillment: null (unfulfilled)   ← both at once
   Day 2  Shipped
          financial: paid        fulfillment: fulfilled
   Day 3  Returns one box, refunded
          financial: partially_refunded   fulfillment: fulfilled
```

At Day 0 the order is *paid* and *unfulfilled* simultaneously — two answers, two fields. That's the whole reason for two axes.

---

## Anatomy of an Order

```
   ORDER  (id: 6001, name: "#1001")
   ├─ line_items[]         ← variants × qty, PRICE SNAPSHOTTED (9002 × 2 @ 550.00)
   ├─ customer             ← Alice (id 7001)
   ├─ shipping_address / billing_address
   ├─ financial_status:    "paid"          ← the money axis
   ├─ fulfillment_status:  null            ← the goods axis
   ├─ total_price, subtotal, total_tax     ← computed, now frozen
   ├─ transactions[]       ← money events (auth, capture, refund)
   └─ fulfillments[]       ← shipment events
```

- **Line-item prices are a snapshot** — recorded as at sale time. Raising the variant's price later doesn't change this order. (The draft used the price current when you built it.)
- **`name` vs `id`.** `id` (`6001`) is Shopify's internal handle; `name` (`#1001`) is the human-facing number on the receipt. Don't use the display number as a key.

---

## Architecture: two tracks

```
                      ORDER CREATED
                 (from checkout or draft completion)
                            │
        ┌───────────────────┴────────────────────┐
        ▼                                          ▼
   MONEY TRACK                              GOODS TRACK
   (financial_status)                       (fulfillment_status)

   pending / authorized                     unfulfilled (null)
        │ capture                                │ ship some
        ▼                                        ▼
      paid                                     partial
        │ refund (maybe)                          │ ship rest
        ▼                                        ▼
   partially_refunded / refunded              fulfilled
                                                 │ return (maybe)
                                                 ▼
                                             restocked

        └──────────────► the two tracks advance independently ◄─────────┘

   The whole order can also be:
     • CANCELLED  — sale called off (usually refund + restock)
     • CLOSED/ARCHIVED — removed from the open-orders view (housekeeping only)
```

Cancel vs. archive:

- **Cancel** = "the sale is off." Reverses money (refund) and goods (restock).
- **Archive/close** = "hide from my to-do list." Housekeeping; touches neither axis.

---

## REST Implementation

```
GET /admin/api/2024-10/orders/{order_id}.json
```

```json
{
  "order": {
    "id": 6001,
    "name": "#1001",
    "financial_status": "paid",
    "fulfillment_status": null,
    "customer": { "id": 7001, "email": "alice@example.com" },
    "line_items": [ { "variant_id": 9002, "quantity": 2, "price": "550.00", "title": "Classic Tiramisu - Large" } ],
    "subtotal_price": "1100.00",
    "total_tax": "55.00",
    "total_price": "1155.00"
  }
}
```

The chapter is visible: **two status fields on separate axes**, the **snapshotted price**, **`name` vs `id`**, and totals now **frozen**.

You don't `POST` this — it came from Alice paying. Over the API you *read* orders and *act on them* (create a fulfillment, issue a refund) via sub-resources like `/orders/6001/fulfillments.json`.

---

## GraphQL Implementation

```graphql
query {
  order(id: "gid://shopify/Order/6001") {
    name
    displayFinancialStatus       # PAID
    displayFulfillmentStatus     # UNFULFILLED
    totalPriceSet { shopMoney { amount currencyCode } }
    lineItems(first: 10) { edges { node { title quantity } } }
  }
}
```

- Statuses are `displayFinancialStatus` / `displayFulfillmentStatus` (enums like `PAID`, `UNFULFILLED`) — same two axes.
- Money is a structured object (`totalPriceSet { shopMoney { amount currencyCode } }`), even distinguishing shop vs. presentment currency — richer than REST's flat string.

---

## Production Considerations

- **Never collapse the two axes into one status.** A single `order_status` column can't represent "paid but unfulfilled." Model money and fulfillment separately.
- **Treat orders as immutable history.** Corrections go through refunds, order edits, and cancellations — not free-form editing.
- **React to order webhooks idempotently** (`orders/create`, `orders/paid`, `orders/fulfilled`); they can arrive more than once ([Section 04](../04-webhooks/)).
- **Don't confuse `authorized` with `paid`** — shipping on `authorized` means shipping before capture ([Section 07](../07-payments/)).
- **Key off `id`, display `name`.**

---

## Common Misconceptions

**❌ "Paid means shipped."**
Separate axes. `paid` + `unfulfilled` is normal and common.

**❌ "`fulfillment_status: null` means something broke."**
`null` = unfulfilled — the normal starting state.

**❌ "I create orders by POSTing them, like products."**
Orders normally arise from a completed checkout or draft. Direct creation is for special cases (importing history).

**❌ "An order is editable like a draft."**
An Order is committed history; it changes through refunds/edits/cancellations, not free-form editing.

**❌ "Cancelling and archiving are the same."**
Cancel reverses the sale; archive just files it away and changes neither axis.

**❌ "The `#1001` number is the order's ID."**
`name` is the human label; `id` (`6001`) is the technical key.

---

## Frequently Asked Questions

**Q: Why two status fields instead of one?**
Money and goods move independently — paid-but-unshipped, shipped-but-unpaid, refunded-but-delivered. One field can't express two storylines.

**Q: Can an order be fulfilled before it's paid?**
Yes — shipping on trust (net-terms wholesale). Every combination is valid.

**Q: `authorized` vs `paid`?**
`authorized` = funds reserved, not taken; `paid` = captured. Can be two steps ([Section 07](../07-payments/)).

**Q: Cancel vs. archive?**
Cancel calls off the sale (refund + restock); archive just removes it from the open-orders view.

**Q: If a price rises later, do past orders change?**
No — orders snapshot prices at sale time. (The draft used the price current when built.)

**Q: How do I learn an order was paid or shipped?**
Webhooks (`orders/paid`, `orders/fulfilled`), not polling ([Section 04](../04-webhooks/)).

---

## Interview Questions

1. What is an Order, and how does it differ from a Draft Order?
2. Name the two status axes and what each tracks.
3. Give a real state where the axes disagree, and why one field can't represent it.
4. How are orders normally created? Why learn of them via webhooks?
5. What does `fulfillment_status: null` mean?
6. Distinguish `authorized` from `paid`.
7. Distinguish cancelling from archiving.
8. Why are line-item prices a snapshot, unlike a draft order?

---

## Summary

- An **Order** is a **committed sale** — the "after" to the draft's "before," treated as **stable history**.
- Orders are **normally created by Shopify** from a checkout or draft completion; you **read/act on** them and learn of them via **webhooks**.
- Two independent axes: **financial status** (`pending`/`authorized`/`paid`/`refunded`…) and **fulfillment status** (`null`/`partial`/`fulfilled`/`restocked`). `paid` + `unfulfilled` is normal.
- **`authorized` ≠ `paid`**, **cancel ≠ archive**, **`name` ≠ `id`**.
- **Line-item prices are snapshotted** at sale time.
- Model the **two axes separately**, treat orders as immutable, handle order **webhooks idempotently**.

---

## What's Next

→ **Next: [Checkout, Invoice, Payment vs Fulfillment](06-checkout-invoice-payment-vs-fulfillment.md)** — how the invoice URL leads to a checkout, how payment is captured, and a final look at why payment and fulfillment are modeled apart.
