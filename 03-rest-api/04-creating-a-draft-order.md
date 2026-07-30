# Creating a Draft Order

The chapter the repository builds toward. You have variant IDs (Ch. 02) and a customer ID (Ch. 03). Now combine them into a **draft order** — the merchant-driven quotation from [Section 02, Ch. 04](../02-shopify-data-model/04-draft-orders.md), made real.

---

## Business Problem

Alice wants 2 × Large Classic Tiramisu, delivered. Himang needs an open, editable order that Shopify prices out (items + tax + delivery), payable later. Creating it is a single authenticated `POST`.

---

## Mental Model

A draft order is **editable**, **merchant-made**, and **priced by Shopify**. The practical consequence:

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
    "line_items": [ { "variant_id": 9002, "quantity": 2 } ],
    "customer": { "id": 7001 },
    "use_customer_default_address": true
  }
}
```

- **`line_items[].variant_id`** — the **variant** ID (`9002`), never a product ID. `quantity` is how many.
- **`customer.id`** — Alice's ID from Chapter 03; lets Shopify invoice her and file the order under her history.
- **`use_customer_default_address: true`** — use her saved default address.

Note what's **absent**: no `price`, no totals. You describe *what* Alice wants; Shopify prices it.

### The response

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
- **Prices and totals filled in by Shopify** (₹550 × 2 = ₹1,100 + ₹55 tax = ₹1,155).
- **`invoice_url`** — the payment link (Chapter 05).
- **`order_id: null`** — no order exists yet; fills in on completion (Chapter 06).

### Optional extras

The same call can carry a discount and delivery:

```json
{
  "draft_order": {
    "line_items": [{ "variant_id": 9002, "quantity": 2 }],
    "customer": { "id": 7001 },
    "use_customer_default_address": true,
    "applied_discount": { "description": "Regular customer", "value_type": "percentage", "value": "10.0" },
    "shipping_line": { "title": "Local delivery", "price": "50.00" }
  }
}
```

Shopify recomputes totals to include them. You send *inputs*, Shopify does the arithmetic.

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

Copy in [`examples/create-draft-order.js`](../examples/create-draft-order.js).

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

Same inputs, same Shopify-computed totals. IDs are **global IDs**, and you **must check `userErrors`** — a bad variant ID appears there alongside a `200 OK`, not as an HTTP error.

---

## Production Considerations

- **A draft is not revenue.** `open` + `order_id: null` = nothing sold. Don't count it.
- **Validate variant IDs before sending** — a wrong/archived ID fails (REST) or shows in `userErrors` (GraphQL). Pull IDs from Chapter 02, don't guess.
- **Send inputs, trust Shopify's totals** — don't compute tax yourself; that's what the tax engine is for.
- **Creation isn't idempotent** — two `POST`s make two drafts. Track a request key or reconcile so you don't invoice Alice twice.
- **Edit while open** — `PUT /draft_orders/{id}.json` before completing (Chapter 06).

---

## Common Misconceptions

**❌ "I pass the product ID in `line_items`."**
`variant_id`. A product ID fails.

**❌ "I need to calculate and send the total."**
You send items (+ optional discount/shipping); Shopify computes totals.

**❌ "Creating the draft made a sale."**
`order_id` is `null`; no order exists until completion (Chapter 06).

**❌ "The draft is locked once created."**
Editable while `open`.

---

## Frequently Asked Questions

**Q: Must I attach a customer?**
Not strictly, but in this flow yes — it's how the invoice reaches Alice and builds her history.

**Q: Where did the tax come from?**
Shopify's tax engine, from the store's settings and shipping address. You didn't send it.

**Q: How do I add a delivery charge or discount?**
Include `shipping_line` and/or `applied_discount`; Shopify folds them into totals.

**Q: Can I create a draft for something not in the catalog?**
Yes — a custom line item (title + price, no `variant_id`). Catalog items still use `variant_id`.

**Q: I made two identical drafts by accident — why?**
Creation isn't idempotent. Delete the extra (`DELETE /draft_orders/{id}.json`) and add retry-safety.

---

## Interview Questions

1. Which two IDs go into a draft order, and which field carries each?
2. Which fields do you deliberately *not* send, and why?
3. What does `order_id: null` tell you?
4. How do you add a discount and delivery, and who computes the total?
5. Is creation idempotent? The consequence?
6. How do you change a draft before completing?

---

## Summary

- Creating a draft is one `POST /draft_orders.json` with **`line_items` (variant IDs + quantities)** and a **`customer` id**.
- You **send inputs, not totals**; Shopify returns a priced draft with **`status: open`**, computed totals, an **`invoice_url`**, and **`order_id: null`**.
- Optional **`applied_discount`** and **`shipping_line`** fold into the totals.
- It's **not revenue**, **not idempotent**, and **editable while open** — GraphQL `draftOrderCreate` mirrors it (mind `userErrors`).

---

## What's Next

The draft exists and is priced. Now let Alice pay.

→ **Next: [Invoice URLs](05-invoice-urls.md)** — send the invoice so she can pay on Shopify's hosted checkout.
