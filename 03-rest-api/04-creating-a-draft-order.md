# Creating a Draft Order

This is the chapter the whole repository has been building toward. You have variant IDs (Ch. 02) and a customer ID (Ch. 03). Now you combine them into a **draft order** over REST — the merchant-driven quotation from [Section 02, Ch. 04](../02-shopify-data-model/04-draft-orders.md), made real.

---

## Business Problem

Alice wants 2 × Large Classic Tiramisu, delivered. Himang needs an open, editable order that Shopify prices out (items + tax + any delivery) and that can later be paid. That object is a draft order, and creating it is a single authenticated `POST`.

---

## Mental Model

Recall the defining traits (Section 02, Ch. 04): a draft order is **editable**, **merchant-made**, and **priced by Shopify**. The practical consequence for this call:

> You send **line items (variant IDs + quantities)** and a **customer**. You do **not** send prices or totals — Shopify computes them and returns a fully-priced draft with `status: open` and an `invoice_url`.

---

## Architecture

```
   variant IDs (Ch. 02) ┐
                         ├─► POST /draft_orders.json ─► DRAFT ORDER (status: open)
   customer ID  (Ch. 03) ┘                              ├─ Shopify-computed totals
                                                        ├─ invoice_url
                                                        └─ order_id: null  (no order yet)
```

---

## REST Implementation

### The create call

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

Every field earns its place:

- **`line_items[].variant_id`** — the **variant** ID (`9002` = Large Classic Tiramisu), never a product ID. This is where all of Section 02's insistence pays off. `quantity` is how many.
- **`customer.id`** — Alice's customer ID from Chapter 03. Attaching her lets Shopify address the invoice and file the resulting order under her history.
- **`use_customer_default_address: true`** — use Alice's saved default shipping address, so you don't restate it.

Notice what's **absent**: no `price`, no `subtotal`, no `total`. You're describing *what* Alice wants; Shopify prices it.

### The response

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

Read against the concept:

- **`status: "open"`** — editable, not yet an order.
- **`price` and totals filled in by Shopify** — you sent a quantity; it returned money (₹550 × 2 = ₹1,100 + ₹55 tax = ₹1,155).
- **`invoice_url`** — the payment link, ready for Chapter 05.
- **`order_id: null`** — the crucial one: **no order exists yet.** This field stays `null` until the draft is completed (Chapter 06).

### Optional extras

The same call can carry a merchant discount and a delivery charge — both things Section 02 said a draft can hold:

```json
{
  "draft_order": {
    "line_items": [{ "variant_id": 9002, "quantity": 2 }],
    "customer": { "id": 7001 },
    "use_customer_default_address": true,
    "applied_discount": {
      "description": "Regular customer",
      "value_type": "percentage",
      "value": "10.0"
    },
    "shipping_line": { "title": "Local delivery", "price": "50.00" }
  }
}
```

Shopify recomputes totals to include the 10% discount and the ₹50 delivery. You still send no final total — you send the *inputs*, Shopify does the arithmetic.

### Runnable example

```javascript
// create-draft-order.js — create an open draft order for Alice.
// Introduced in: 03-rest-api/04-creating-a-draft-order.md
// Node 18+.  Env: SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN

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

// Pass real IDs from the earlier chapters/examples.
const VARIANT_ID = Number(process.env.VARIANT_ID || 9002); // Large Classic Tiramisu
const CUSTOMER_ID = Number(process.env.CUSTOMER_ID || 7001); // Alice

async function createDraftOrder() {
  const { draft_order } = await shopify("draft_orders.json", {
    method: "POST",
    body: {
      draft_order: {
        line_items: [{ variant_id: VARIANT_ID, quantity: 2 }],
        customer: { id: CUSTOMER_ID },
        use_customer_default_address: true,
      },
    },
  });
  return draft_order;
}

async function main() {
  if (!SHOP || !TOKEN) throw new Error("Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN.");
  const d = await createDraftOrder();
  console.log(`Draft order ${d.id} — status: ${d.status}`);
  console.log(`  subtotal ₹${d.subtotal_price}  tax ₹${d.total_tax}  total ₹${d.total_price}`);
  console.log(`  order_id (should be null): ${d.order_id}`);
  console.log(`  invoice_url: ${d.invoice_url}`);
  console.log(`\nNext: send the invoice or complete draft ${d.id} (chapters 05–06).`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
```

A copy lives in [`examples/create-draft-order.js`](../examples/create-draft-order.js).

---

## GraphQL Implementation

The `draftOrderCreate` mutation (Section 05):

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

Same inputs (variant + quantity + customer), same Shopify-computed totals. Two GraphQL notes carried from Section 02: IDs are **global IDs**, and **you must check `userErrors`** — e.g. a bad variant ID appears there alongside a `200 OK`, not as an HTTP error.

---

## Production Considerations

- **A draft is not revenue.** `status: open` with `order_id: null` means nothing has sold. Don't count it (Section 02, Ch. 04).
- **Validate variant IDs before sending.** A wrong or archived variant ID fails the call (REST) or shows in `userErrors` (GraphQL). Pull IDs from Chapter 02's flow, don't hardcode guesses.
- **Send inputs, trust Shopify's totals.** Don't compute tax yourself and stuff it in — Shopify's tax engine is the point ([Section 01](../01-introduction/01-what-is-shopify.md)). Send items, discount, and shipping; read back the totals.
- **Draft creation is not idempotent.** Two `POST`s make two drafts. If a create might be retried, track your own request key or reconcile, so you don't invoice Alice twice.
- **Editing happens while open.** Need to change quantities or add a discount after creating? Update the draft (`PUT /draft_orders/{id}.json`) while it's still `open` — before completing (Chapter 06).

---

## Common Misconceptions

**❌ "I pass the product ID in `line_items`."**
Reality: `variant_id`. A product ID fails. (The trap Section 02 kept warning about.)

**❌ "I need to calculate and send the total."**
Reality: You send items (+ optional discount/shipping); Shopify computes subtotal, tax, and total. Sending your own total is unnecessary and error-prone.

**❌ "Creating the draft created an order / made a sale."**
Reality: `order_id` is `null`; no order exists. Only completion (Chapter 06) creates one.

**❌ "The draft is locked once created."**
Reality: It's editable while `open` — update line items, discounts, shipping before completing.

---

## Frequently Asked Questions

**Q: Do I have to attach a customer?**
Not strictly, but in this flow you do — it's how the invoice reaches Alice and how her order history is built. Use the customer ID from Chapter 03.

**Q: Where did the tax figure come from?**
Shopify's tax engine, based on the store's settings and the shipping address. You didn't send it; Shopify computed `total_tax`.

**Q: How do I add a delivery charge or a discount?**
Include `shipping_line` and/or `applied_discount` in the payload (shown above). Shopify folds them into the totals.

**Q: Can I create a draft for something not in the catalog?**
Yes — a custom line item (title + price, no `variant_id`), the deliberate exception from Section 02. Catalog items still use `variant_id`.

**Q: I created two identical drafts by accident. Why?**
Draft creation isn't idempotent — each `POST` is a new draft. Delete the extra (`DELETE /draft_orders/{id}.json`) and add retry-safety to your code.

---

## Interview Questions

1. What two IDs from earlier chapters go into a draft order, and which field carries each?
2. Which fields do you deliberately *not* send, and why?
3. What does `order_id: null` in the response tell you?
4. How do you add a discount and a delivery charge, and who computes the resulting total?
5. Is draft creation idempotent? What's the consequence?
6. While the draft is `open`, how do you change it before completing?

---

## Summary

- Creating a draft order is one authenticated `POST /draft_orders.json` carrying **`line_items` (variant IDs + quantities)** and a **`customer` id** — the outputs of Chapters 02 and 03.
- You **send inputs, not totals**; Shopify returns a fully-priced draft with **`status: open`**, computed **subtotal/tax/total**, an **`invoice_url`**, and **`order_id: null`** (no order yet).
- Optional **`applied_discount`** and **`shipping_line`** let Shopify recompute totals to include a discount and delivery.
- It's **not revenue**, **not idempotent**, and **editable while open** — with the GraphQL `draftOrderCreate` mutation mirroring it (mind `userErrors`).

---

## What's Next

The draft exists and is priced. Now let Alice pay it.

→ **Next chapter: [Invoice URLs](05-invoice-urls.md)** — send Alice the draft's invoice so she can pay on Shopify's hosted checkout, and understand exactly what that URL is.
