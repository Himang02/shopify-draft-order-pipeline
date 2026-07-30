# Checkout, Invoice, Payment vs. Fulfillment

This chapter closes Section 02 with two jobs: fill in the objects *between* a draft order and a shipped sale — **invoice**, **checkout**, **payment** — and assemble everything into **one pipeline**. By the end you can trace a sale from Alice's phone call to a fulfilled order, naming every object.

---

## Business Problem

Himang has a draft order for Alice (₹1,155 with tax and delivery). The gap: **Alice is on the phone, not the website. How does she pay, and how does that become a shippable order?** Himang needs to:

1. Send a **request to pay** — an **invoice**.
2. Give her a **place to pay** — a **checkout**.
3. **Collect the money** — **payment**.
4. Separately, **send the tiramisu** — **fulfillment**.

Four distinct things, easy to blur into "she pays and we're done." Keeping them distinct is what lets Shopify (and your code) handle each correctly.

---

## Mental Model

- **Invoice** — a *request for payment* the merchant sends. For a draft order it includes an **`invoice_url`**: a link to a hosted checkout. The "please pay this" message, with a pay button.
- **Checkout** — the *process* of a buyer entering shipping/payment and paying. A procedure, not a stored record — its purpose is to end in an **Order**. Like a cashier lane: you go through it, you don't take it home.
- **Payment** — *money moving*, recorded as **Transactions** on the order.
- **Fulfillment** — *goods moving*, recorded as **Fulfillments** on the order.

> An **invoice** points to a **checkout**; completing the **checkout** collects **payment** and produces an **Order**; **fulfillment** happens afterward, on its own schedule.

---

## Architecture: the whole pipeline

Section 02 in one picture — the canonical flow this repo teaches.

```
     Alice (customer)          Variants (what she's buying)
          │                          │
          └───────────┬──────────────┘
                      ▼
              ┌───────────────┐
              │  DRAFT ORDER   │   merchant-built quotation (status: open)
              └───────────────┘
                      │  send invoice
                      ▼
              ┌───────────────┐
              │    INVOICE      │   "please pay ₹1,155"  →  contains invoice_url
              └───────────────┘
                      │  Alice clicks the link
                      ▼
              ┌───────────────┐
              │   CHECKOUT      │   she enters card + confirms address
              │  (a process)    │
              └───────────────┘
                      │  she pays
                      ▼
              ┌───────────────┐
              │    PAYMENT      │   money captured  →  recorded as Transactions
              └───────────────┘
                      │  on success, Shopify creates...
                      ▼
              ┌───────────────┐
              │     ORDER       │   committed sale   (draft → completed)
              │ financial: paid │
              │ fulfill:  null  │
              └───────────────┘
                      │  later, separately
                      ▼
              ┌───────────────┐
              │  FULFILLMENT    │   tiramisu shipped  →  fulfillment: fulfilled
              └───────────────┘
```

**draft order → invoice → checkout → payment → order → fulfillment.** The draft is the *before*, the order the *pivot*, fulfillment the *after*.

(This is the merchant-driven path. The shopper-driven path is identical from *checkout* onward — a cart leads into checkout, payment, and an order — without the draft/invoice prefix. [Section 08](../08-checkout/).)

---

## Internal Working

### Invoice

Sending an invoice emails a "please pay" message and exposes the **`invoice_url`** — not a PDF, but a **live hosted checkout** pre-loaded with Alice's items and totals. Calling `send_invoice` (Section 03) moves the draft to `invoice_sent`.

Two clarifications:

- The invoice **does not charge anyone automatically** — it's an *invitation*. Nothing is captured until Alice goes through checkout.
- Sending it **does not create an Order** — the draft is still just `invoice_sent`. Only *payment* creates the order.

### Checkout

Where the buyer commits: confirm address, enter payment, pay. **Checkout is a process, not a durable object you manage** — you care about its output: a completed checkout *becomes an Order*.

Alice pays on **Shopify's hosted checkout**, so you never touch her card details — the PCI gift from [Section 01](../01-introduction/01-what-is-shopify.md). The `invoice_url` drops her into that same secure checkout.

### Payment

Money moves through a **payment gateway** (Shopify Payments or a third party); Shopify records **Transactions** on the order. Two steps ([order chapter](05-orders-and-the-order-lifecycle.md)):

- **Authorize** — reserve funds (`financial_status: authorized`).
- **Capture** — collect them (`financial_status: paid`).

Often together at checkout, sometimes split (authorize now, capture at shipping). [Section 07](../07-payments/). For the data model: **payment is recorded as transactions, and it's what flips a draft into a paid order.**

### Fulfillment

A **Fulfillment** records shipping some or all line items (tracking number, carrier). It advances the *fulfillment* axis (`null → partial → fulfilled`) — a separate action on a separate axis.

---

## Payment vs. Fulfillment

The final, direct treatment of one of Shopify's most important models:

> **Payment is the money moving. Fulfillment is the goods moving. They're independent, tracked as two separate axes on the order.**

They separate because in the real world they *are* separate — different times, order, amounts:

```
   PAYMENT (money)                 FULFILLMENT (goods)
   ─ recorded as Transactions      ─ recorded as Fulfillments
   ─ drives financial_status       ─ drives fulfillment_status
   ─ authorize → capture → refund  ─ unfulfilled → partial → fulfilled → restocked
   ─ answers "did we get paid?"    ─ answers "did we ship it?"
```

Cases that only work with two axes:

- **Paid, not shipped** — Alice paid Monday, ships Friday. (`paid` + `unfulfilled`.)
- **Shipped, not paid** — wholesale on net-30. (`authorized`/`pending` + `fulfilled`.)
- **Partially both** — one of three items shipped, half the money captured.
- **Refunded but delivered** — a goodwill refund. (`refunded` + `fulfilled`.)

One "order status" couldn't represent these honestly. **Model them as two fields in your own systems too** — collapsing them is a bug you'll regret.

---

## REST & GraphQL

Each piece maps to an API surface (details in [Section 03](../03-rest-api/) and [Section 05](../05-graphql/)):

- **Invoice** — REST `POST /draft_orders/{id}/send_invoice.json`; `invoice_url` is a field on the draft. GraphQL `draftOrderInvoiceSend`.
- **Checkout** — not scripted in this flow; it's the hosted page `invoice_url` opens. (Custom checkouts: [Section 08](../08-checkout/).)
- **Payment** — **Transactions** on the order: REST `/orders/{id}/transactions.json`; capture via a capture transaction / `orderCapture`.
- **Fulfillment** — REST `/orders/{id}/fulfillments.json` (modern flow uses *fulfillment orders*); GraphQL `fulfillmentCreate`.

Same pipeline, two vocabularies.

---

## Production Considerations

- **An invoice is an invitation, not a charge.** `invoice_sent` isn't income; money exists only once the order is `paid`.
- **Use the hosted checkout** — don't rebuild it to avoid PCI; the `invoice_url` keeps card data off your systems.
- **Model payment and fulfillment as two independent fields.** Every "why can't I represent this state" bug is a collapsed status column.
- **Fulfillment is its own workflow** — tracking, partial shipments, carrier updates, webhooks. Plan for partial/multi-shipment orders.
- **Capture timing is a real decision** — authorize-now-capture-later vs. capture-at-checkout ([Section 07](../07-payments/)).

---

## Common Misconceptions

**❌ "The invoice is just a PDF."**
It's a *payment request* whose `invoice_url` opens a live hosted checkout — actionable, not a static file.

**❌ "Sending the invoice charges the customer / creates the order."**
It only *invites* payment. Nothing is captured and no order exists until she completes checkout.

**❌ "Checkout and order are the same."**
Checkout is the *process*; the Order is the *result*.

**❌ "Once payment succeeds, the sale is finished."**
Payment flips the money axis to `paid`; the goods axis is still `unfulfilled`. Fulfillment is a separate step.

**❌ "Payment and fulfillment always happen together, in that order."**
Independent axes. Shipped-before-paid, partial-both, and refunded-after-delivery are all valid.

**❌ "I need Alice's card details to charge her."**
She pays on Shopify's hosted checkout via a gateway. You never see raw card data.

---

## Frequently Asked Questions

**Q: What is the `invoice_url`?**
A link for a draft order that opens a Shopify-hosted checkout pre-filled with its items and totals. The bridge from a draft to actual payment.

**Q: Does sending an invoice take Alice's money?**
No — it sends a request and a pay link. Money moves only when she completes checkout. Until then the draft is `invoice_sent`, no order exists.

**Q: Is a "checkout" an object I store like an order?**
Not in this flow. It's the paying *process*; you care about its output (an Order). Shopify hosts it. Custom checkouts: [Section 08](../08-checkout/).

**Q: Why keep payment and fulfillment separate?**
They're genuinely independent — different timing, amounts, failure modes. Two axes report both "did we get paid?" and "did we ship?" One field can't.

**Q: Capture-then-ship or ship-then-capture?**
Both are possible; authorize/capture and fulfillment are independent. Depends on the business ([Section 07](../07-payments/)).

**Q: Where does raw card data live?**
Nowhere in your systems — Shopify's hosted checkout and the gateway handle it (the PCI protection from Section 01).

---

## Interview Questions

1. Define invoice, checkout, payment, fulfillment in one sentence each.
2. Is the `invoice_url` a document or a checkout? What does opening it do?
3. Does sending an invoice create an order? What does?
4. Why is checkout a "process, not a stored object"?
5. State the payment-vs-fulfillment principle and give two states where the axes disagree.
6. Trace the full pipeline, naming every object.
7. Why don't you handle card details in this flow?

---

## Summary

- The pipeline: **draft order → invoice → checkout → payment → order → fulfillment.**
- An **invoice** is a *request to pay* whose **`invoice_url`** opens a hosted **checkout**; sending it neither charges nor creates an order.
- A **checkout** is the *process* of paying; its result is an **Order**. It's hosted by Shopify, keeping card data off your systems.
- **Payment** (Transactions, `financial_status`, authorize→capture) and **fulfillment** (Fulfillments, `fulfillment_status`) are **two independent axes** — model them separately.
- Only **payment** turns the draft into a paid Order; **fulfillment** happens afterward, and every combination is possible.
- REST and GraphQL expose each step — same pipeline, two vocabularies.

---

## What's Next

That completes the **Shopify Data Model** — you can name every core object and trace a full sale.

→ **Next: [Section 03 — REST Admin API](../03-rest-api/).** We stop looking at JSON shapes and start *making the calls* — authenticating, then running the draft-order pipeline end-to-end over HTTP.
