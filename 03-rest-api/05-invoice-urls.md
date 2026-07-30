# Invoice URLs

You have an open, priced draft order. Alice needs a way to pay. This chapter is the bridge: the **invoice** — a "please pay" message with a link to a hosted checkout. Concept from [Section 02, Ch. 06](../02-shopify-data-model/06-checkout-invoice-payment-vs-fulfillment.md); here we do it over REST.

---

## Business Problem

Alice is on the phone, not the website. Himang needs to send her something to click to pay — pre-filled with her order and total. That's the draft's **`invoice_url`**, delivered via Shopify's **send-invoice** action.

---

## Mental Model

Two things, kept distinct:

- **`invoice_url`** — a *link* to a Shopify-hosted checkout, pre-loaded with the draft's items and totals. It exists on the draft from the moment you create it.
- **Sending the invoice** — the action of *delivering* that link (Shopify emails it), which also moves the draft to `invoice_sent`.

> The `invoice_url` is the pay page; "send invoice" mails Alice the link. Neither charges her — she pays by going through the checkout.

And:

> Sending an invoice **does not charge** Alice and **does not create an order**. Only her *completing the checkout* does (Chapter 06).

---

## Architecture

```
   DRAFT ORDER (open)  ──already has──► invoice_url
        │
        │ POST /draft_orders/{id}/send_invoice.json
        ▼
   Shopify emails Alice the link ; status → invoice_sent
        │
        │ Alice opens invoice_url
        ▼
   Shopify-hosted CHECKOUT  (she enters card, pays)
        │
        ▼
   payment captured → ORDER created (Chapter 06)
```

---

## REST Implementation

### Send the invoice

```
POST /admin/api/2024-10/draft_orders/5001/send_invoice.json
```

```json
{
  "draft_order_invoice": {
    "to": "alice@example.com",
    "subject": "Your Himang's Tiramisu order",
    "custom_message": "Thanks for calling in, Alice! Here's your invoice."
  }
}
```

- **`to`** — defaults to the attached customer's email if omitted.
- **`subject` / `custom_message`** — optional personalization.

An empty body (`{}`) works too. After this call the draft is `invoice_sent`.

### Just want the link (no email)?

The `invoice_url` is already on the draft — `GET` it and deliver the link however you like (SMS, WhatsApp, your own email):

```
GET /admin/api/2024-10/draft_orders/5001.json
→ draft_order.invoice_url = "https://himangs-tiramisu.myshopify.com/.../invoices/abc123"
```

So two delivery styles: let **Shopify email it** (`send_invoice`), or **grab the URL** and send it yourself. Only `send_invoice` flips the status to `invoice_sent`.

### Runnable example

```javascript
// send-invoice.js — email a draft order's invoice to the customer.
// Introduced in: 03-rest-api/05-invoice-urls.md
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

  // Option A: read the link without sending an email.
  const { draft_order } = await shopify(`draft_orders/${DRAFT_ID}.json`);
  console.log("Invoice URL (share it yourself if you prefer):");
  console.log("  " + draft_order.invoice_url);

  // Option B: have Shopify email the invoice (moves status to invoice_sent).
  await shopify(`draft_orders/${DRAFT_ID}/send_invoice.json`, {
    method: "POST",
    body: {
      draft_order_invoice: {
        custom_message: "Thanks for calling in, Alice! Here's your invoice.",
      },
    },
  });

  const { draft_order: after } = await shopify(`draft_orders/${DRAFT_ID}.json`);
  console.log(`Invoice sent. Draft ${after.id} status is now: ${after.status}`);
  console.log("No order exists yet — Alice must pay via the link (chapter 06).");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
```

Copy in [`examples/send-invoice.js`](../examples/send-invoice.js).

---

## GraphQL Implementation

The `draftOrderInvoiceSend` mutation (Section 05):

```graphql
mutation {
  draftOrderInvoiceSend(id: "gid://shopify/DraftOrder/5001") {
    draftOrder { id status invoiceUrl }
    userErrors { field message }
  }
}
```

Same effect: email the invoice, status → `invoice_sent`, `invoiceUrl` available. Check `userErrors`.

---

## Production Considerations

- **`invoice_sent` is not income** — it means "we asked." Record revenue only when the order is `paid` (Chapter 06).
- **Learn of payment via webhooks** (`orders/create`/`orders/paid`), not by polling the draft ([Section 04](../04-webhooks/)).
- **Invoices can be re-sent and can linger** — have a reminder/expiry policy.
- **Use the hosted checkout** — the `invoice_url` keeps card data off your systems (PCI). You never handle the payment form.
- **Deliverability matters** — Shopify's email can hit spam; for important B2B, share the `invoice_url` through your own channel.

---

## Common Misconceptions

**❌ "Sending the invoice charges Alice."**
It only delivers a pay link. Money moves when she completes checkout.

**❌ "Sending the invoice creates the order."**
No — the order is created when she pays (Chapter 06). Until then `order_id` is `null`.

**❌ "The `invoice_url` only exists after send_invoice."**
It's on the draft from creation. `send_invoice` *delivers* it and sets the status.

**❌ "I should build my own payment page."**
The hosted checkout handles PCI and payment methods. Rebuilding forfeits that.

---

## Frequently Asked Questions

**Q: `invoice_url` vs `send_invoice`?**
`invoice_url` is the pay link (present from creation). `send_invoice` emails it and sets `invoice_sent`.

**Q: Send the link without Shopify's email?**
Yes — read `invoice_url` and deliver it any way. Skipping `send_invoice` means the status won't become `invoice_sent`.

**Q: How do I know when Alice pays?**
Webhooks (`orders/create`/`orders/paid`), not polling ([Section 04](../04-webhooks/)).

**Q: Can I resend?**
Yes — call `send_invoice` again (good for reminders).

**Q: Does she need a Shopify account?**
No — the hosted checkout supports guest payment.

---

## Interview Questions

1. Distinguish `invoice_url` from `send_invoice`.
2. Does sending an invoice charge or create an order? What does?
3. When does `invoice_url` first exist?
4. Give two ways to deliver the link; which sets `invoice_sent`?
5. How should your system learn the customer paid?
6. Why not build your own payment page?

---

## Summary

- The **`invoice_url`** links to a **hosted checkout** pre-filled with Alice's order; it exists from draft creation.
- **`POST /draft_orders/{id}/send_invoice.json`** emails it and sets **`invoice_sent`**; or **read `invoice_url`** and deliver it yourself.
- Sending **neither charges nor creates an order** — only completing the checkout does. `invoice_sent` is **not revenue**; learn of payment via **webhooks**.
- The hosted checkout keeps **card data off your systems**; GraphQL mirrors this with `draftOrderInvoiceSend`.

---

## What's Next

Alice pays — or Himang collects another way. Either ends the same: a real order.

→ **Next: [Completing a Draft Order → Order](06-completing-a-draft-order.md)** — the draft becomes a committed Order and `order_id` fills in.
