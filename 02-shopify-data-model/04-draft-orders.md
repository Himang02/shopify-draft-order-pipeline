# Draft Orders

The object the repository is named for. You now have both ingredients of a sale — **what** is bought (variants) and **who** buys (a customer). The Draft Order brings them together *before* any money changes hands. Understand it and how it becomes an Order, and you understand the spine of the pipeline.

---

## Business Problem

Alice calls: "Two Large Classic Tiramisus, delivered Friday. I'll pay by card." Himang needs to:

1. Assemble the order — 2 × Large Classic Tiramisu.
2. Work out the real total — items + tax + delivery − any discount.
3. Give Alice a way to pay — she's on the phone, not the website.
4. *After she pays*, treat it as a committed sale to fulfil.

The catch: an **Order** represents a *committed, usually-paid sale*. Alice hasn't paid, and the total isn't final. Creating an Order now would fake a sale that hasn't happened.

Himang needs an object for **"an order I'm preparing, not real yet"** — editable, total-computing, with a way for Alice to pay. That's the **Draft Order**.

---

## Mental Model

> A **Draft Order** is a merchant-prepared **quotation** — a proposed order, not yet paid and not yet an Order. It's editable, computes totals like a real order, and becomes an Order when the time is right.

Three defining words:

- **Quotation.** Like a contractor's quote — "here's the cost" without committing anyone. It can still change.
- **Editable.** Until completed, add items, adjust quantities, apply a discount, add shipping. An Order, by contrast, is a stable record you don't casually rewrite.
- **Merchant-made.** Created by the merchant (or your code), **never by the shopper**. The mirror image of checkout, where the shopper drives and Shopify produces an Order. Draft Orders are the *merchant-driven* path.

Recall the [map](01-the-shopify-data-model.md): Draft Order and Order are **two distinct objects**, and one becomes the other.

---

## Why not just create an Order directly?

An **Order** is a *committed sale*: it counts toward revenue, can trigger fulfillment, implies payment happened or is expected. Creating one for a sale that hasn't happened pollutes all of that.

The Draft Order exists to *build up* a sale — negotiate items, compute totals, send a payment link — **without** asserting "a sale occurred." Only when Alice pays (or Himang confirms) does it become an Order, and *then* the Order machinery kicks in.

> Draft Order = the *preparation* phase. Order = the *committed* result.

---

## What a Draft Order contains

Structurally like an Order — because it's a rehearsal for one:

```
   DRAFT ORDER  (id: 5001, status: open)
   ├─ line_items[]        ← variants × quantities (variant 9002 × 2)
   ├─ customer            ← who it's for (Alice, 7001) — usually attached
   ├─ shipping_address    ← from Alice's addresses
   ├─ applied_discount    ← optional merchant discount
   ├─ shipping_line       ← optional delivery charge
   ├─ (tax)               ← Shopify computes
   └─ totals              ← subtotal, tax, total — computed by Shopify
        invoice_url        ← a payment link
        status             ← open → invoice_sent → completed
```

Mapping to what you know:

- **Line items** are the connector — each points at a **variant**, never a product.
- **Customer** — attaching Alice makes the invoice and shipping work, and files the Order under her history.
- **Totals are computed by Shopify.** You send line items, an optional discount, and shipping; it calculates subtotal, tax, total.
- **`invoice_url`** — the bridge to payment: a Shopify-hosted checkout link.

**Custom line items:** a line item is *usually* a variant, but can also be a one-off (title + price, no variant — e.g. "Custom message — ₹150"). The deliberate exception for off-catalog charges. Catalog items still use the variant.

---

## Architecture: the lifecycle

The journey from phone call to real Order:

```
   Alice calls
       │
       ▼
  ┌───────────────────────────┐
  │  Himang / your code        │
  │  CREATES a Draft Order      │   status: open
  │  (line items + customer)   │
  └───────────────────────────┘
       │  (still editable: add items, discount, shipping)
       ▼
  ┌───────────────────────────┐
  │  Draft Order calculates     │
  │  totals (subtotal+tax+ship) │
  └───────────────────────────┘
       │
       ├───────────── path A: send an invoice ──────────────┐
       │                                                     │
       ▼                                                     ▼
  status: invoice_sent                            path B: mark as paid /
  Alice gets invoice_url,                          complete directly
  opens it, pays on                                (e.g. cash, already paid)
  Shopify's checkout                                        │
       │                                                     │
       └──────────────────────┬──────────────────────────────┘
                              ▼
                 ┌───────────────────────────┐
                 │  A real ORDER is created   │   Draft Order → status: completed
                 │  (separate object)         │   (linked to the new Order)
                 └───────────────────────────┘
                              │
                              ▼
                 now the Order machinery applies:
                 payment (Transaction), fulfillment, history
```

The two ways a Draft Order becomes an Order:

- **Path A — send an invoice.** Shopify generates the `invoice_url`; Alice pays on Shopify's checkout; on payment, Shopify creates the Order and marks the draft `completed`.
- **Path B — complete it directly.** Payment happened out-of-band (cash, card terminal). Himang marks it complete; Shopify creates the Order without an online payment step.

Either way:

> Completing a Draft Order **creates a new, separate Order**. The draft isn't renamed — it becomes `completed` and points to the Order via `order_id`. Two linked objects.

---

## REST Implementation

Full walk-through in [Section 03](../03-rest-api/); here's the shape.

**Create:**

```
POST /admin/api/2024-10/draft_orders.json
```

```json
{
  "draft_order": {
    "line_items": [ { "variant_id": 9002, "quantity": 2 } ],
    "customer": { "id": 7001 },
    "use_customer_default_address": true
  }
}
```

You send **variant IDs, quantities, and a customer** — no prices or totals. Shopify fills them in:

```json
{
  "draft_order": {
    "id": 5001,
    "status": "open",
    "invoice_url": "https://himangs-tiramisu.myshopify.com/.../invoices/abc123",
    "line_items": [ { "variant_id": 9002, "quantity": 2, "price": "550.00", "title": "Classic Tiramisu - Large" } ],
    "subtotal_price": "1100.00",
    "total_tax": "55.00",
    "total_price": "1155.00",
    "order_id": null
  }
}
```

- **`status: "open"`** — editable, not yet an order.
- **`invoice_url`** — the payment link (Path A).
- **Prices and totals filled in by Shopify** — you sent quantities, it returned money.
- **`order_id: null`** — no Order exists yet; it fills in on completion, linking the two.

**Send invoice** (Path A): `POST /draft_orders/5001/send_invoice.json` → `invoice_sent`.
**Complete directly** (Path B): `PUT /draft_orders/5001/complete.json` → Order created, `order_id` set, `completed`.

---

## GraphQL Implementation

The same lifecycle as *mutations* ([Section 05](../05-graphql/)):

```graphql
mutation {
  draftOrderCreate(input: {
    lineItems: [{ variantId: "gid://shopify/ProductVariant/9002", quantity: 2 }]
    customerId: "gid://shopify/Customer/7001"
  }) {
    draftOrder { id status totalPrice invoiceUrl }
    userErrors { field message }
  }
}
```

Two GraphQL-isms:

- **Mutations, not endpoints** — `draftOrderCreate`, `draftOrderInvoiceSend`, `draftOrderComplete`, all at one endpoint.
- **`userErrors`** — business failures (e.g. "variant not found") come back here alongside a `200 OK`, not as an HTTP error. Always check it (Section 05).

---

## Production Considerations

- **A Draft Order is not revenue.** Only the Order it produces is a sale. Don't count drafts.
- **Learn of completion via webhooks** (`orders/create` / `draft_orders/update`), not polling ([Section 04](../04-webhooks/)).
- **Drafts can linger** at `open`/`invoice_sent`. Have a reminder/expiry/cleanup policy.
- **Editing stops at completion.** Get the draft right while `open`; afterward, changes follow stricter Order/refund rules.
- **Inventory is reserved at completion, not creation.** Two drafts for the last 12 Larges can both exist; the crunch is at completion.

---

## Common Misconceptions

**❌ "A Draft Order is an Order (just an early one)."**
Two distinct objects. Completing a draft *creates* a separate Order; the draft becomes `completed` and links to it.

**❌ "Creating a Draft Order records a sale."**
No Order exists until completion. `order_id` is `null` until then — a draft is a quotation, not a sale.

**❌ "Customers create Draft Orders."**
Merchant-driven — created by the merchant or your code. Shopper purchases go through checkout.

**❌ "Draft Orders aren't editable."**
Editability is the whole point while `open`.

**❌ "I pass product IDs into line items."**
Variant IDs (or custom one-offs). A product ID fails.

---

## Frequently Asked Questions

**Q: Why isn't an Order created immediately?**
Because the sale hasn't happened. An Order means "committed sale" with revenue/fulfillment implications. The draft is preparation; the Order is created only at completion.

**Q: Why are Draft Orders editable when Orders mostly aren't?**
A draft is a work-in-progress quotation; an Order is a record of something that happened (changes go through refunds/edits). Different life stages, different mutability.

**Q: The two ways a draft becomes an Order?**
(A) Send an invoice — customer pays the `invoice_url`. (B) Complete directly — merchant marks it paid.

**Q: After completion, one object or two?**
Two — the draft (`completed`, `order_id` set) and the new Order. Linked, not merged.

**Q: Must I attach a customer?**
Not strictly, but in the phone/wholesale flow you almost always do ([Customers](03-customers.md)).

**Q: Can I put something not in my catalog on a draft?**
Yes — a custom line item (title + price, no variant). Catalog items still use the variant ID.

---

## Interview Questions

1. What is a Draft Order? Give the three defining words.
2. Why does it exist instead of creating an Order directly?
3. Are a Draft Order and an Order the same object? What happens to each at completion?
4. Who creates Draft Orders, and how does that contrast with checkout?
5. Name the two paths to becoming an Order.
6. Why don't you send prices or totals?
7. What does `order_id: null` tell you?
8. Which ID do line items reference, and what's the exception?

---

## Summary

- A **Draft Order** is a merchant-driven **quotation**: **editable**, total-computing, never created by the shopper.
- It's a **distinct object from an Order.** Completing it **creates a separate Order** and marks the draft `completed`, linked via `order_id`.
- **Line items reference variants** (custom one-offs excepted); a **customer** is usually attached. You send items + customer; **Shopify computes totals**.
- Two completions: **send an invoice** or **complete directly**.
- No Order — no sale — until completion (`order_id` `null` before). Don't count drafts as revenue; learn of completion via **webhooks**.
- REST uses distinct endpoints; GraphQL uses **mutations** and returns `userErrors`.

---

## What's Next

You understand the "before." Next, the "after."

→ **Next: [Orders and the order lifecycle](05-orders-and-the-order-lifecycle.md)** — what an Order is, its statuses, and how payment and fulfillment attach.
