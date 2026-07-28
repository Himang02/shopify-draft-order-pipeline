# Orders and the Order Lifecycle

The [Draft Order chapter](04-draft-orders.md) ended at the moment a draft is completed and "a real Order is created." This chapter is about that Order: what it actually is, and — the part that matters most — how its life is tracked along **two independent axes** that beginners constantly conflate.

If you take one idea from this chapter, make it this: **payment and fulfillment are separate.** An Order tracks them separately, on purpose.

---

## Business Problem

Alice paid for her two Large Classic Tiramisus. Now Himang has a *real sale* to manage, and several distinct questions to answer over the next few days:

- **Did we get the money?** (Alice paid by card — yes.)
- **Have we sent the tiramisu?** (Not yet — it's baking; it ships Friday.)
- **What if she cancels, or we refund her?** (Then the money question changes, but the "did we ship" question might not.)

Notice these are *different* questions with *different* answers at the *same* moment: **paid, but not yet shipped.** A single "order status" field can't capture that — "is it done?" has two independent meanings here. Money and goods move on their own schedules.

This is the problem the Order object solves: it's the committed record of the sale, and it tracks *the money* and *the goods* as two separate storylines.

---

## Mental Model

> An **Order** is Shopify's record of a *committed sale* — what was bought, by whom, for how much — plus two running status lines: one for **payment**, one for **fulfillment**.

Two mental anchors:

1. **An Order is the "after"; a Draft Order was the "before."** The draft was an editable quotation. The Order is a record of something that *happened*, so it's treated as stable — you don't casually rewrite it (changes go through refunds, edits, and cancellations with rules). Think *receipt*, not *shopping list*.

2. **Two axes, not one.** Every Order carries:
   - a **financial status** — where the *money* stands (unpaid, paid, refunded…), and
   - a **fulfillment status** — where the *goods* stand (unfulfilled, partially fulfilled, fulfilled…).

   These move independently. "Paid + unfulfilled" is normal. So is "fulfilled + unpaid" (Himang shipped on trust). One field could never express both.

```
   ORDER  (a committed sale)
        │
        ├── financial status ──►  the MONEY story  (Transactions)
        └── fulfillment status ─►  the GOODS story  (Fulfillments)
```

This is the concrete form of the "payment ≠ fulfillment" idea flagged all the way back in [Section 01](../01-introduction/02-shopify-vs-amazon.md) and on the [data-model map](01-the-shopify-data-model.md). The Order is where the two storylines physically live as two fields.

---

## How an Order comes to exist

Recall from the map: **you usually don't create Orders directly — Shopify creates them for you.** There are two normal births:

```
   Shopper-driven:                    Merchant-driven:
   shopper completes CHECKOUT         merchant completes a DRAFT ORDER
            │                                   │
            └──────────────┬────────────────────┘
                           ▼
                   Shopify creates an ORDER
```

- **From a checkout** — a shopper on the storefront pays; Shopify produces the Order. (Checkout gets its own chapter next, and [Section 08](../08-checkout/).)
- **From a Draft Order completion** — the flow this repository is about: Himang's draft for Alice is completed, and Shopify mints the Order.

There *is* a REST endpoint to `POST` an Order directly, but it's for special cases (importing historical orders, unusual integrations), not the everyday path. For this course, **Orders arrive from checkouts and draft completions** — which is exactly why you often learn about them via **webhooks** rather than by creating them yourself.

---

## The two status axes in detail

This is the core of the chapter. Each axis is a small state machine.

### Financial status — the money

Where payment stands for the order:

| Status | Meaning |
|--------|---------|
| `pending` | Payment initiated but not confirmed yet. |
| `authorized` | Card authorized (funds held) but **not yet captured**. Money isn't in the account yet. |
| `paid` | Payment captured. The money is collected. |
| `partially_paid` | Some, not all, has been paid. |
| `refunded` | Fully refunded back to the customer. |
| `partially_refunded` | Part refunded. |
| `voided` | An authorization was cancelled before capture. |

The `authorized` vs `paid` distinction matters and comes up again in [Section 07](../07-payments/): **authorize** = "we've reserved the money"; **capture** = "we've actually taken it." They can be two separate steps.

### Fulfillment status — the goods

Where delivery stands:

| Status | Meaning |
|--------|---------|
| `null` (unfulfilled) | Nothing shipped yet. **`null` is normal**, not an error — a brand-new paid order is unfulfilled. |
| `partial` | Some line items shipped, others not. |
| `fulfilled` | Everything shipped. |
| `restocked` | Items returned to inventory (e.g. after cancellation). |

The most common gotcha: seeing `fulfillment_status: null` and thinking something broke. It just means "not shipped yet."

### Why they're independent (a worked example)

Alice's order over four days:

```
   Day 0  Draft completed, Alice paid
          financial: paid        fulfillment: null (unfulfilled)   ← both true at once
   Day 2  Tiramisu baked & shipped
          financial: paid        fulfillment: fulfilled
   Day 3  Alice returns one box, Himang refunds it
          financial: partially_refunded   fulfillment: fulfilled
```

At **Day 0**, the order is simultaneously *paid* and *unfulfilled* — two different answers, two different fields. No single "status" could say that. That's the whole reason for two axes.

---

## Anatomy of an Order

```
   ORDER  (id: 6001, name: "#1001")
   ├─ line_items[]         ← what was bought: variants × qty, PRICE SNAPSHOTTED
   │     • variant 9002 × 2 @ 550.00  (captured at sale time)
   ├─ customer             ← Alice (id 7001)
   ├─ shipping_address / billing_address
   ├─ financial_status:    "paid"          ← the money axis
   ├─ fulfillment_status:  null            ← the goods axis
   ├─ total_price, subtotal, total_tax     ← computed, now frozen
   ├─ transactions[]       ← money events (auth, capture, refund)
   └─ fulfillments[]       ← shipment events
```

Two details worth their own note:

- **Line-item prices are a snapshot.** The Order records the price *as it was at the time of sale* (`550.00`). If Himang later raises the price of the Large Classic Tiramisu, this Order doesn't change — it's a historical record. (Contrast the draft order, which reflected the *current* variant price when you built it.)
- **`name` vs `id`.** The `id` (`6001`) is Shopify's internal handle. The `name` (`"#1001"`) is the human-facing order number Alice sees on her receipt. They're different things — don't use the display number as a database key.

---

## Architecture: the lifecycle as two tracks

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

   Meanwhile the whole order can be:
     • CANCELLED  — the sale is called off (often triggers refund + restock)
     • CLOSED/ARCHIVED — removed from the open-orders workspace (housekeeping,
                          not a state of money or goods)
```

Cancel vs. archive is a common confusion:

- **Cancel** = "this sale is off." A real action that usually reverses money (refund) and goods (restock).
- **Archive / close** = "hide it from my to-do list." Pure housekeeping — the order still happened; it's just filed away. It says nothing about payment or fulfillment.

---

## REST Implementation

Fetching Alice's order (authentication is [Section 03](../03-rest-api/)):

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
    "line_items": [
      { "variant_id": 9002, "quantity": 2, "price": "550.00", "title": "Classic Tiramisu - Large" }
    ],
    "subtotal_price": "1100.00",
    "total_tax": "55.00",
    "total_price": "1155.00"
  }
}
```

Everything the chapter said is visible: the two **status fields on separate axes**, the **snapshotted line-item price**, the **`name` vs `id`**, and totals now **frozen** as a record.

You wouldn't normally `POST` this into being — it arrived from Alice paying her invoice. What you *do* over the API is *read* orders and *act on them*: create a fulfillment, issue a refund, add a note. Those live under the order (e.g. `/orders/6001/fulfillments.json`).

---

## GraphQL Implementation

The same order as a GraphQL type (details in [Section 05](../05-graphql/)):

```graphql
query {
  order(id: "gid://shopify/Order/6001") {
    name
    displayFinancialStatus       # PAID
    displayFulfillmentStatus     # UNFULFILLED
    totalPriceSet { shopMoney { amount currencyCode } }
    lineItems(first: 10) {
      edges { node { title quantity } }
    }
  }
}
```

Two GraphQL notes:

- The status fields are `displayFinancialStatus` / `displayFulfillmentStatus`, returned as enums like `PAID` and `UNFULFILLED` — the same two axes, just spelled as GraphQL enums.
- Money is a structured object again (`totalPriceSet { shopMoney { amount currencyCode } }`), and even distinguishes shop currency vs. presentment currency — richer than REST's flat string, same underlying value.

---

## Production Considerations

- **Never collapse the two axes into one status in your own system.** If your database has a single `order_status` column, you'll eventually be unable to represent "paid but unfulfilled." Model money and fulfillment separately, mirroring Shopify.
- **Treat orders as immutable history.** Don't try to "edit" an order the way you edited a draft. Corrections happen through refunds, order edits, and cancellations — each with its own rules and side effects.
- **React to orders via webhooks, idempotently.** You'll receive `orders/create`, `orders/paid`, `orders/fulfilled`, etc. Webhooks can arrive more than once, so make your handlers idempotent (processing the same event twice must be safe). ([Section 04](../04-webhooks/).)
- **Don't confuse `authorized` with `paid`.** If you release goods on `authorized`, you're shipping before the money is captured. Know which one your flow requires. ([Section 07](../07-payments/).)
- **Key off `id`, show `name`.** Store the numeric `id`; display the `#1001` name to humans. They serve different purposes.

---

## Common Misconceptions

**❌ "An order being paid means it's been shipped."**
Reality: Payment and fulfillment are separate axes. `paid` + `unfulfilled` is a completely normal, common state.

**❌ "`fulfillment_status: null` means something went wrong."**
Reality: `null` means *unfulfilled* — nothing shipped yet. It's the normal starting state of a fresh order.

**❌ "I create orders by POSTing them, like products."**
Reality: Orders normally arise from a completed checkout or a completed draft order. Direct creation exists but is for special cases (e.g. importing history).

**❌ "An order is editable like a draft order."**
Reality: An Order is a committed record. It changes through refunds/edits/cancellations under rules — not free-form editing. The editable stage was the draft.

**❌ "Cancelling and archiving an order are the same."**
Reality: Cancel reverses the sale (money + goods). Archive/close just files it away for housekeeping and changes neither axis.

**❌ "The `#1001` order number is the order's ID."**
Reality: `name` (`#1001`) is the human-facing label; `id` (`6001`) is the technical key. Use `id` in code.

---

## Frequently Asked Questions

**Q: Why does an order have two separate status fields instead of one?**
Because money and goods move independently. At any moment an order can be paid-but-unshipped, or shipped-but-unpaid, or refunded-but-already-delivered. A single status can't express two independent storylines, so Shopify uses two axes: `financial_status` and `fulfillment_status`.

**Q: Can an order be fulfilled before it's paid?**
Yes. Fulfillment and payment are independent. A merchant might ship on trust (net-terms wholesale, for instance) so an order can be `fulfilled` while still `pending`/`authorized`. The model allows every combination.

**Q: What's the difference between `authorized` and `paid`?**
`authorized` means the funds are reserved on the card but not yet taken; `paid` means they've been captured (actually collected). They can be two steps — you authorize at order time and capture later. Details in [Section 07](../07-payments/).

**Q: What's the difference between cancelling and archiving an order?**
Cancelling calls off the sale — it typically refunds the money and restocks the goods. Archiving (closing) merely removes the order from your open-orders view; it's housekeeping and doesn't touch either status.

**Q: If Himang raises a price later, do past orders change?**
No. An order snapshots line-item prices at sale time. It's a historical record; later catalog changes don't rewrite it. (The draft order, by contrast, used the price current *when you built the draft*.)

**Q: How do I find out an order was paid or shipped?**
Via webhooks (`orders/paid`, `orders/fulfilled`, …), not polling. Shopify pushes these events to your server. ([Section 04](../04-webhooks/).)

---

## Interview Questions

1. What is an Order, and how does it differ from a Draft Order?
2. Name the two status axes of an order and what each tracks.
3. Give a normal, real state where the two axes disagree, and explain why one field couldn't represent it.
4. How are orders normally created? Why do you usually learn about them via webhooks?
5. What does `fulfillment_status: null` mean?
6. Distinguish `authorized` from `paid`.
7. Distinguish cancelling an order from archiving it.
8. Why are order line-item prices a "snapshot," and how does that differ from a draft order?

---

## Summary

- An **Order** is the record of a **committed sale** — the "after" to the draft order's "before." It's treated as **stable history**, not a free-form editable document.
- Orders are **normally created by Shopify** from a completed **checkout** or a completed **draft order**; you usually **read** and **act on** them (and learn of them via **webhooks**) rather than creating them.
- Every order tracks **two independent axes**: **financial status** (the money — `pending`/`authorized`/`paid`/`refunded`…) and **fulfillment status** (the goods — `null`/`partial`/`fulfilled`/`restocked`). `paid` + `unfulfilled` is normal.
- **`authorized` ≠ `paid`** (reserved vs. captured); **cancel ≠ archive** (reverse the sale vs. housekeeping); **`name` ≠ `id`** (human label vs. technical key).
- Order **line-item prices are snapshotted** at sale time — a historical record that later catalog changes don't alter.
- In your own systems, **model the two axes separately**, treat orders as immutable history, and handle order **webhooks idempotently**.

---

## What's Next

You now know the "before" (draft order) and the "after" (order), and that payment and fulfillment ride separate rails. The last data-model chapter ties together the pieces *between* them.

→ **Next chapter: [Checkout, Invoice, Payment vs Fulfillment](06-checkout-invoice-payment-vs-fulfillment.md)** — how the invoice URL leads to a checkout, how payment is captured, and a final, dedicated look at why payment and fulfillment are modeled apart. Then [Section 03](../03-rest-api/) makes the entire pipeline real over HTTP.
