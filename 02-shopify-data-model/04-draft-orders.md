# Draft Orders

This is the object the repository is named for. Everything so far — the platform model, the store, variants, customers — was groundwork so that this chapter lands cleanly. If you understand the Draft Order and how it turns into an Order, you understand the spine of the entire pipeline.

We now have the two ingredients a sale needs: **what** is being bought (variants) and **who** is buying (a customer). The Draft Order is where they come together — *before* any money changes hands.

---

## Business Problem

Alice calls Himang: "Two Large Classic Tiramisus, delivered Friday. I'll pay by card."

Think about what Himang needs to do, in order:

1. Assemble the order — 2 × the Large Classic Tiramisu variant.
2. Work out the real total — item prices, plus tax, plus a delivery charge, minus any discount Himang offers a regular like Alice.
3. Give Alice a way to actually pay — she's on the phone, not on the website.
4. Only *after she pays*, treat it as a real, committed sale to fulfil.

Now here's the catch. The obvious object — an **Order** — represents a *committed, usually-paid sale*. Alice hasn't paid. She hasn't even confirmed the final total, because Himang is still adding the delivery charge. Creating a real Order now would be lying about the state of the world: it would look like a sale that hasn't happened.

What Himang needs is an object for **"an order I'm preparing, that isn't real yet"** — something editable, that can compute totals, and that can hand Alice a way to pay. That object is the **Draft Order**.

---

## Mental Model

> A **Draft Order** is a *quotation the merchant prepares* — a proposed order that is not yet paid and not yet a real Order. It is editable, it calculates totals like a real order, and it can be turned into a real Order when the time is right.

Three words capture it: **quotation**, **editable**, **merchant-made**.

- **Quotation.** Like a quote a contractor sends before a job. It says "here's what this would cost" without committing anyone. Alice can look at it, and it can still change.
- **Editable.** Until it's completed, Himang can add items, adjust quantities, apply a discount, add shipping. A real Order, by contrast, is meant to be a stable record of something that happened — you don't casually rewrite it.
- **Merchant-made.** A Draft Order is created *by the merchant* (Himang, or your code acting for Himang) — **never by the shopper directly.** This is the mirror image of normal checkout, where the *shopper* drives and Shopify produces an Order at the end. Draft Orders are the *merchant-driven* path to a sale.

Recall the [data-model map](01-the-shopify-data-model.md): Draft Order and Order are **two distinct objects**, and one becomes the other. Hold that firmly — it's the fact beginners most often blur.

---

## Why not just create an Order directly?

This deserves a direct answer, because it's the "why does this exist" question.

An **Order** is Shopify's record of a *committed sale*. It carries meaning: it counts toward revenue reports, it can trigger fulfillment, it usually implies payment happened or is expected. Creating one out of thin air for a sale that hasn't happened would pollute all of that.

The Draft Order exists precisely so there's a place to *build up* a sale — negotiate items, compute the total, send a payment link — **without** prematurely asserting "a sale occurred." Only when Alice pays (or Himang confirms she has) does the Draft Order graduate into a real Order, and *then* all the Order machinery correctly kicks in.

> Draft Order = the *preparation* phase. Order = the *committed* result. Separating them keeps "what we're negotiating" cleanly apart from "what actually sold."

---

## What a Draft Order contains

Structurally, a Draft Order looks a lot like an Order — because it's a rehearsal for one:

```
   DRAFT ORDER  (id: 5001, status: open)
   ├─ line_items[]        ← the heart: variants × quantities
   │     • variant 9002 (Large Classic Tiramisu) × 2
   ├─ customer            ← who it's for (Alice, id 7001) — usually attached
   ├─ shipping_address    ← where it goes (from Alice's addresses)
   ├─ applied_discount    ← optional merchant discount
   ├─ shipping_line       ← optional delivery charge
   ├─ (tax)               ← Shopify computes this
   └─ totals              ← subtotal, tax, total — computed by Shopify
        invoice_url        ← a payment link (once you send/generate it)
        status             ← open → invoice_sent → completed
```

The pieces map onto everything you've learned:

- **Line items** are the connector from the map — each points at a **variant** (2 × variant `9002`), never a product. This is where "transactional operations use the variant ID" becomes real.
- **Customer** is the object from the last chapter — attaching Alice makes the invoice and shipping work, and files the eventual Order under her history.
- **Totals are computed by Shopify.** You don't hand Shopify a final price; you hand it line items, an optional discount, and a shipping line, and it calculates subtotal, tax, and total. This is a feature — the tax logic from [Section 01](../01-introduction/01-what-is-shopify.md) is doing its job.
- **`invoice_url`** is the bridge to payment: a Shopify-hosted checkout link Alice can open to pay. More on it in [Section 03](../03-rest-api/) and its own concept in the invoice chapter.

### One nuance: custom line items

A Draft Order line item is *usually* a variant, but it can also be a **custom one-off** — a title and a price with no variant behind it (e.g. "Custom birthday message on box — ₹150"). This is a Draft-Order-specific convenience for things that aren't in the catalog. Don't let it blur the main rule: for catalog products, you reference the **variant**; custom line items are the deliberate exception for off-catalog charges.

---

## Architecture: the lifecycle

This is the diagram to burn into memory — the journey from phone call to real Order.

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

Read the two paths off the diagram — they're the two ways a Draft Order becomes an Order:

- **Path A — send an invoice.** Shopify generates an `invoice_url` (a checkout link). Alice opens it and pays on Shopify's secure checkout. On payment, Shopify creates the Order and marks the Draft Order `completed`. This is the classic "customer pays remotely" flow.
- **Path B — complete it directly.** Sometimes the merchant handles payment out-of-band (Alice paid cash, or over a phone card terminal). Himang marks the Draft Order complete, and Shopify creates the Order without an online payment step.

Either way, the crucial fact:

> Completing a Draft Order **creates a new, separate Order object.** The Draft Order isn't "renamed" to an Order — it becomes `completed` and points to the Order it produced. Two objects, linked.

---

## REST Implementation

Authentication and the full runnable walk-through are [Section 03](../03-rest-api/); here we look at shapes so the object is concrete.

**Create** a draft order for Alice:

```
POST /admin/api/2024-10/draft_orders.json
```

```json
{
  "draft_order": {
    "line_items": [
      { "variant_id": 9002, "quantity": 2 }
    ],
    "customer": { "id": 7001 },
    "use_customer_default_address": true
  }
}
```

Notice how little you send: **variant IDs, quantities, and a customer.** You do *not* send prices or totals — Shopify looks up the variant's price and computes the rest. The response comes back fleshed out:

```json
{
  "draft_order": {
    "id": 5001,
    "status": "open",
    "invoice_url": "https://himangs-tiramisu.myshopify.com/.../invoices/abc123",
    "line_items": [
      { "variant_id": 9002, "quantity": 2, "price": "550.00", "title": "Classic Tiramisu - Large" }
    ],
    "subtotal_price": "1100.00",
    "total_tax": "55.00",
    "total_price": "1155.00",
    "order_id": null
  }
}
```

Key fields to connect back to the concept:

- **`status: "open"`** — editable, not yet an order.
- **`invoice_url`** — the payment link (Path A).
- **`price` and totals are filled in by Shopify** — you sent quantities, it returned money.
- **`order_id: null`** — no Order exists *yet*. When you complete the draft, this gets populated with the new Order's id — literally the link between the two objects.

**Send the invoice** (Path A): `POST /draft_orders/5001/send_invoice.json` → status becomes `invoice_sent`.

**Complete directly** (Path B): `PUT /draft_orders/5001/complete.json` → Shopify creates the Order, `order_id` fills in, status becomes `completed`.

---

## GraphQL Implementation

The same lifecycle as GraphQL *mutations* (verbs that change data — covered in [Section 05](../05-graphql/)):

```graphql
mutation {
  draftOrderCreate(input: {
    lineItems: [{ variantId: "gid://shopify/ProductVariant/9002", quantity: 2 }]
    customerId: "gid://shopify/Customer/7001"
  }) {
    draftOrder {
      id
      status
      totalPrice
      invoiceUrl
    }
    userErrors { field message }
  }
}
```

Two GraphQL-isms to *notice* (details in [Section 05](../05-graphql/)):

- **Mutations, not endpoints.** Creating a draft order is the `draftOrderCreate` mutation; completing it is `draftOrderComplete`; sending the invoice is `draftOrderInvoiceSend`. One endpoint, different mutation names — versus REST's different URLs.
- **`userErrors`.** GraphQL returns business-rule failures (e.g. "variant not found") inside a `userErrors` array *alongside* a `200 OK`, rather than as an HTTP error. You must check it. This surprises REST developers and gets its own attention in Section 05.

Same three moves — create, send invoice, complete — expressed as mutations.

---

## Production Considerations

- **A Draft Order is not revenue.** Don't count draft orders as sales in your own reporting. Only the *Order* they produce is a real sale. Confusing the two inflates your numbers with quotes that were never paid.
- **Learn about completion via webhooks.** When a customer pays an invoice, the Order is created by Shopify — your system finds out through an `orders/create` (or `draft_orders/update`) webhook, not by polling. Design for "Shopify will tell me it completed." ([Section 04](../04-webhooks/).)
- **Draft Orders can linger.** An unpaid draft can sit `open` or `invoice_sent` indefinitely. Decide on a policy — reminders, expiry, cleanup — so stale quotes don't pile up.
- **Editing stops at completion.** You can edit freely while `open`; once completed into an Order, changes follow the stricter Order/refund rules. Get the draft right *before* completing.
- **Inventory is reserved at completion, not creation.** Creating a draft doesn't necessarily hold stock. Two drafts for the last 12 Larges can both exist; the crunch happens when they complete. Don't assume a draft guarantees availability.

---

## Common Misconceptions

**❌ "A Draft Order is an Order (just an early one)."**
Reality: They are two distinct objects. A Draft Order represents a *possible future* order. Completing it *creates* a separate Order; the draft is then marked `completed` and linked to it.

**❌ "Creating a Draft Order creates an Order / records a sale."**
Reality: No Order exists until the draft is completed (paid or marked paid). `order_id` is `null` until then. A draft on its own is a quotation, not a sale.

**❌ "Customers create Draft Orders."**
Reality: Draft Orders are *merchant-driven* — created by the merchant or your code. Shopper-driven purchases go through checkout and produce Orders directly. Draft Orders are the manual/assisted-sale path.

**❌ "Draft Orders aren't editable."**
Reality: Editability is the whole point. While `open`, you can add items, change quantities, apply discounts, and set shipping. That flexibility is why the object exists.

**❌ "I pass product IDs into a draft order's line items."**
Reality: Line items reference **variant** IDs (or are custom one-offs). Passing a product ID fails — the exact trap from the Products-vs-Variants chapter.

---

## Frequently Asked Questions

**Q: Why isn't an Order created immediately when I create a Draft Order?**
Because the sale hasn't happened yet. An Order means "a committed sale," with all the revenue and fulfillment implications that carries. The draft is the *preparation* stage; forcing an Order to exist before payment would misrepresent reality. The Order is created only at completion.

**Q: Why are Draft Orders editable when Orders (mostly) aren't?**
Because a draft is a work-in-progress quotation — you're still assembling it. An Order is a record of something that already happened, so it's meant to be stable (changes go through refunds/edits with rules). Different life stages, different mutability.

**Q: What are the two ways a Draft Order becomes an Order?**
(A) Send an invoice — the customer pays via the `invoice_url` checkout link, and Shopify creates the Order on payment. (B) Complete it directly — the merchant marks it paid (cash/manual), and Shopify creates the Order without an online payment step.

**Q: After completion, are there two objects or one?**
Two. The Draft Order (now `completed`, with `order_id` pointing at the Order) and the new Order. They're linked, not merged.

**Q: Do I have to attach a customer?**
Not strictly, but in the phone/wholesale flow you almost always do — it's how the invoice reaches the right person and how the resulting Order lands in their history. (See [Customers](03-customers.md).)

**Q: Can I put something not in my catalog on a draft order?**
Yes — a *custom line item* (title + price, no variant). It's the deliberate exception for off-catalog charges. Catalog items still go by variant ID.

---

## Interview Questions

1. What is a Draft Order, in one sentence? Give the three defining words.
2. Why does the Draft Order exist instead of just creating an Order directly?
3. Are a Draft Order and an Order the same object? What happens to each at completion?
4. Who creates Draft Orders, and how does that contrast with normal checkout?
5. Name the two paths by which a Draft Order becomes an Order.
6. When you create a draft order, why don't you send prices or totals?
7. What does `order_id: null` on a draft order tell you?
8. Which ID do a draft order's line items reference, and what's the exception?

---

## Summary

- A **Draft Order** is a merchant-prepared **quotation**: **editable**, total-calculating, and **merchant-driven** (never created by the shopper). It exists so a sale can be *assembled* before it's committed.
- It's a **distinct object from an Order.** Completing a draft **creates a separate Order** and marks the draft `completed`, linked via `order_id`.
- Its **line items reference variants** (with custom one-offs as the exception); attaching a **customer** is usual. You send items + customer; **Shopify computes the totals**.
- Two ways to complete: **send an invoice** (customer pays the `invoice_url`) or **complete directly** (merchant marks it paid).
- No Order — and no sale — exists until completion (`order_id` is `null` before then). Don't count drafts as revenue, and expect to learn of completion via **webhooks**.
- REST uses distinct endpoints (`/draft_orders`, `/send_invoice`, `/complete`); GraphQL uses **mutations** (`draftOrderCreate`, `draftOrderInvoiceSend`, `draftOrderComplete`) and returns `userErrors`.

---

## What's Next

You understand the "before." Next we make the "after" precise.

→ **Next chapter: [Orders and the order lifecycle](05-orders-and-the-order-lifecycle.md)** — what an Order actually is once it exists, its statuses, and how payment and fulfillment attach to it. After that, the invoice/checkout/payment-vs-fulfillment chapter completes the data model, and [Section 03](../03-rest-api/) makes all of this real over HTTP.
