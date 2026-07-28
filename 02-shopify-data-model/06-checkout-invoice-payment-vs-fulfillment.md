# Checkout, Invoice, Payment vs. Fulfillment

This chapter closes Section 02 and does two jobs at once. First, it fills in the objects *between* a draft order and a finished, shipped sale — the **invoice**, the **checkout**, and **payment**. Second, it steps back and assembles everything from this section into **one pipeline**, so the individual objects finally click together as a single flow.

By the end you'll be able to trace a sale end-to-end — from Alice's phone call to a fulfilled order — and name every object it passes through.

---

## Business Problem

Himang has created a draft order for Alice (2 × Large Classic Tiramisu, ₹1,155 with tax and delivery). Now the practical gap: **Alice is on the phone, not on the website. How does she actually pay, and how does that payment become a real, shippable order?**

Concretely, Himang needs to:

1. Send Alice a **request to pay** — a message that says "here's your order, here's the total, here's how to pay." That's an **invoice**.
2. Give her a **place to pay** — a secure page where she enters her card. That's a **checkout**.
3. Actually **collect the money** when she does. That's **payment**.
4. Then, separately, **send the tiramisu**. That's **fulfillment**.

Four distinct things, easy to blur into "she pays and we're done." Keeping them distinct is exactly what lets Shopify (and your code) handle each correctly.

---

## Mental Model

Four plain definitions:

- **Invoice** — a *request for payment* the merchant sends to the customer. For a draft order, it includes an **`invoice_url`**: a link to a hosted checkout where the customer can pay. Think of it as the "please pay this" message, with a pay button.
- **Checkout** — the *process* of a buyer providing shipping and payment details and paying. It's a *procedure*, not a stored record you keep — its whole purpose is to end in an **Order**. Think of it as the cashier lane: you go through it; you don't take it home.
- **Payment** — *money actually moving* from the customer to the merchant, recorded as **Transactions** on the order. Think "the till ringing."
- **Fulfillment** — *goods actually moving* from the merchant to the customer, recorded as **Fulfillments** on the order. Think "the box going out the door."

The relationships in one line each:

> An **invoice** points to a **checkout**; completing the **checkout** collects **payment** and produces an **Order**; **fulfillment** happens afterward, on its own schedule.

---

## Architecture: the whole pipeline, assembled

Here is Section 02 in a single picture — the canonical flow this repository teaches. Every box is an object you now know.

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

Read the shape: **draft order → invoice → checkout → payment → order → fulfillment.** The draft order is the *before*, the order is the *pivot*, and fulfillment is the *after*. Payment lives at the pivot; fulfillment hangs off the far side.

(This is the merchant-driven path. The shopper-driven path is the same from *checkout* onward — a shopper's cart leads into a checkout, payment, and an order — just without the draft-order/invoice prefix. That version is [Section 08](../08-checkout/).)

---

## Internal Working

Walk the four new pieces in order.

### Invoice

For a draft order, sending an invoice does two things: it emails the customer a "please pay" message, and it exposes an **`invoice_url`**. That URL is not a PDF — it's a **live, hosted checkout** pre-loaded with Alice's line items and totals. When Himang calls `send_invoice` (Section 03), the draft's status moves to `invoice_sent`, and Alice receives a link she can open anytime to pay.

Two clarifications that prevent confusion:

- The invoice **does not charge anyone automatically.** It's an *invitation* to pay. Alice must open the link and go through checkout. Nothing is captured until she does.
- Sending the invoice **does not create an Order.** The draft is still just a draft (`invoice_sent`). Only *payment* creates the order. (This is the "why isn't an order created immediately" idea from the [draft order chapter](04-draft-orders.md), seen from the invoice side.)

### Checkout

The checkout is where the buyer commits: confirm shipping address, choose/enter payment, and pay. Crucially, **checkout is a process, not a durable object you manage** — you rarely read or write "a checkout" the way you read an order. Its output is what you care about: a completed checkout *becomes an Order*.

Because Alice pays on **Shopify's hosted checkout**, Himang (and you) never touch her raw card details — the PCI-compliance gift from [Section 01](../01-introduction/01-what-is-shopify.md). The `invoice_url` simply drops Alice into that same secure checkout.

### Payment

When Alice pays, money moves through a **payment gateway** (Shopify Payments or a third party), and Shopify records the result as **Transactions** on the order. Recall the two-step nature from the [order chapter](05-orders-and-the-order-lifecycle.md):

- **Authorize** — reserve the funds on the card (`financial_status: authorized`).
- **Capture** — actually collect them (`financial_status: paid`).

Often these happen together at checkout; they can also be split (authorize now, capture when you ship). Full treatment in [Section 07](../07-payments/). The point for the data model: **payment is recorded as transactions, and it's what flips a draft into a paid order.**

### Fulfillment

Once the order exists and is paid, the goods still have to move. A **Fulfillment** is the record of shipping some or all of an order's line items — with a tracking number, a carrier, and so on. It updates the order's *fulfillment* axis (`null → partial → fulfilled`). It is a **separate action on a separate axis**, which is the whole next section.

---

## Payment vs. Fulfillment (the dedicated treatment)

This idea has been flagged since Section 01; here it gets its final, direct explanation, because it's one of the most important mental models in all of Shopify.

> **Payment is the money moving. Fulfillment is the goods moving. They are independent, and Shopify tracks them as two separate axes on the order.**

Why separate them? Because in the real world they *are* separate, and they routinely happen at different times, in different orders, by different amounts:

```
   PAYMENT (money)                 FULFILLMENT (goods)
   ─ recorded as Transactions      ─ recorded as Fulfillments
   ─ drives financial_status       ─ drives fulfillment_status
   ─ authorize → capture → refund  ─ unfulfilled → partial → fulfilled → restocked
   ─ answers "did we get paid?"    ─ answers "did we ship it?"
```

Concrete cases that only make sense with two axes:

- **Paid, not yet shipped** — Alice paid Monday; tiramisu ships Friday. (`paid` + `unfulfilled`.) The most common state of a fresh order.
- **Shipped, not yet paid** — a trusted wholesale buyer gets goods on net-30 terms. (`authorized`/`pending` + `fulfilled`.)
- **Partially both** — a 3-item order where one item shipped and half the money was captured.
- **Refunded but already delivered** — Alice keeps the tiramisu but gets a goodwill refund. (`refunded` + `fulfilled`.)

If Shopify had a single "order status," none of these could be represented honestly. Two axes let the order always tell the truth about *both* stories at once. **In your own systems, model them as two fields too** — collapsing them is a bug you'll regret.

---

## REST & GraphQL

The pieces map to concrete API surfaces (full walk-through in [Section 03](../03-rest-api/), GraphQL in [Section 05](../05-graphql/)):

- **Invoice** — REST: `POST /draft_orders/{id}/send_invoice.json`; the `invoice_url` is a field on the draft order. GraphQL: `draftOrderInvoiceSend`.
- **Checkout** — mostly *not* something you script in this flow; it's the hosted page the `invoice_url` opens. (Custom/headless checkouts are advanced — [Section 08](../08-checkout/).)
- **Payment** — surfaces as **Transactions** on the order: REST `/orders/{id}/transactions.json`; GraphQL via the order's transactions. Capturing is `POST` a capture transaction / `orderCapture`.
- **Fulfillment** — REST `/orders/{id}/fulfillments.json` (modern flow uses *fulfillment orders*); GraphQL `fulfillmentCreate`. Updates the fulfillment axis.

The theme of the whole section holds: **learn the objects and the pipeline once, and REST vs. GraphQL is just two ways to name the same steps.**

---

## Production Considerations

- **An invoice is an invitation, not a charge.** Don't treat `invoice_sent` as income. Money exists only once payment is captured and the order is `paid`.
- **Don't build your own checkout to avoid PCI — use the hosted one.** The `invoice_url` checkout keeps card data off your systems. Rebuilding it forfeits that protection for no good reason in this flow.
- **Model payment and fulfillment as two independent fields.** (Said twice on purpose.) Every "why can't I represent this order's state" bug traces back to one collapsed status column.
- **Fulfillment is its own workflow.** Tracking numbers, partial shipments, and carrier updates all live on the fulfillment axis and often flow back as webhooks. Plan for partial and multi-shipment orders, not just "ship everything at once."
- **Capture timing is a real decision.** Authorize-now-capture-later vs. capture-at-checkout changes when money is truly yours and when you should ship. Decide deliberately ([Section 07](../07-payments/)).

---

## Common Misconceptions

**❌ "The invoice is just a PDF document."**
Reality: A draft-order invoice is a *payment request* whose `invoice_url` opens a live, hosted checkout. It's actionable, not a static file.

**❌ "Sending the invoice charges the customer / creates the order."**
Reality: The invoice only *invites* payment. Nothing is captured and no order exists until the customer completes checkout and pays.

**❌ "Checkout and order are the same thing."**
Reality: Checkout is the *process* of paying; the Order is the *result*. A completed checkout produces an order; the checkout itself isn't the durable record.

**❌ "Once payment succeeds, the sale is finished."**
Reality: Payment flips the money axis to `paid`, but the goods axis is still `unfulfilled`. Fulfillment is a separate, later step.

**❌ "Payment and fulfillment happen together, in that order, every time."**
Reality: They're independent axes. Paid-then-shipped is common, but shipped-before-paid, partial-both, and refunded-after-delivery are all valid.

**❌ "I need to handle Alice's card details to charge her."**
Reality: She pays on Shopify's hosted checkout via a gateway. You never see raw card data.

---

## Frequently Asked Questions

**Q: What exactly is the `invoice_url`?**
It's a link, generated for a draft order, that opens a Shopify-hosted checkout pre-filled with the order's line items and totals. The customer opens it and pays there. It's the bridge from a draft order to actual payment.

**Q: Does sending an invoice take Alice's money?**
No. It sends her a request and a pay link. Money moves only when she goes through the checkout and pays. Until then the draft is `invoice_sent`, not paid, and no order exists.

**Q: Is a "checkout" an object I create and store like an order?**
Not in this flow. Checkout is the paying *process*; you care about its output (an Order). You generally don't manage checkout objects directly here — Shopify hosts it. Custom checkouts are an advanced topic in [Section 08](../08-checkout/).

**Q: Why keep payment and fulfillment separate instead of one "status"?**
Because they're genuinely independent in the real world — different timing, different amounts, different failure modes. Two axes let an order honestly report both "did we get paid?" and "did we ship?" at once. One field cannot.

**Q: Can Himang capture payment but ship later — or ship first and capture later?**
Yes to both. Authorize/capture and fulfillment are independent. The right choice depends on the business (retail vs. wholesale terms). See [Section 07](../07-payments/).

**Q: Where does raw card data live?**
Nowhere in your systems. It's handled by Shopify's hosted checkout and the payment gateway. That's the PCI protection from Section 01, in action.

---

## Interview Questions

1. Define invoice, checkout, payment, and fulfillment in one sentence each.
2. Is the `invoice_url` a document or a checkout? What does opening it do?
3. Does sending an invoice create an order? What actually does?
4. Why is checkout described as a "process, not a stored object"?
5. State the payment-vs-fulfillment principle and give two real states where the two axes disagree.
6. Trace the full pipeline from Alice's phone call to a fulfilled order, naming every object.
7. Why don't you handle the customer's card details in this flow?

---

## Summary

- The pipeline this repository teaches: **draft order → invoice → checkout → payment → order → fulfillment.**
- An **invoice** is a *request to pay* whose **`invoice_url`** opens a hosted **checkout**; sending it neither charges the customer nor creates an order.
- A **checkout** is the *process* of paying; its result is an **Order**. You don't manage checkout as a durable object in this flow, and the customer pays on **Shopify's hosted checkout**, keeping card data off your systems.
- **Payment** (money, recorded as **Transactions**, driving `financial_status` via authorize→capture) and **fulfillment** (goods, recorded as **Fulfillments**, driving `fulfillment_status`) are **two independent axes** — model them separately.
- Only **payment** turns the draft into a **paid Order**; **fulfillment** happens afterward on its own schedule, and every payment/fulfillment combination is possible.
- REST and GraphQL expose each step (`send_invoice`/`draftOrderInvoiceSend`, transactions/capture, fulfillments) — same pipeline, two vocabularies.

---

## What's Next

That completes the **Shopify Data Model**. You can now name every core object, explain how each relates to the others, and trace a full sale from a phone call to a shipped box. This is the conceptual foundation the rest of the course builds on.

→ **Next: [Section 03 — REST Admin API](../03-rest-api/).** We stop looking at JSON shapes and start *making the calls* — authenticating to Himang's store, then creating products, customers, and finally running the draft-order pipeline end-to-end over HTTP. Everything you just learned becomes real code.
