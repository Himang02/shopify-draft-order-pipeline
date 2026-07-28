# Invoice URLs

You have an open, priced draft order for Alice. She still needs a way to pay. This chapter is about that bridge: the **invoice** — sending Alice a "please pay" message with a link to a hosted checkout. The concept is from [Section 02, Ch. 06](../02-shopify-data-model/06-checkout-invoice-payment-vs-fulfillment.md); here we do it over REST.

---

## Business Problem

Alice is on the phone, not the website. Himang needs to send her something she can click to pay — pre-filled with her exact order and total. That's the draft order's **`invoice_url`**, delivered via Shopify's **send-invoice** action.

---

## Mental Model

Two things, easy to conflate, kept distinct (Section 02, Ch. 06):

- **`invoice_url`** — a *link* to a Shopify-hosted checkout, pre-loaded with the draft's line items and totals. It already exists on the draft order the moment you create it.
- **Sending the invoice** — the action of *delivering* that link to the customer (Shopify emails it), which also moves the draft's status to `invoice_sent`.

> The `invoice_url` is the pay page; "send invoice" is mailing Alice the link. Neither one charges her — she pays by opening the link and going through checkout.

And the two rules that keep beginners honest:

> Sending an invoice **does not charge** Alice and **does not create an order**. Only her *completing the checkout* (paying) does — which produces the order in Chapter 06.

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

- **`to`** — recipient; defaults to the attached customer's email if omitted.
- **`subject` / `custom_message`** — optional personalization on the email.

An empty body (`{}`) works too — Shopify uses the customer's email and a default template. After this call, the draft's status is `invoice_sent`.

### Just want the link (no email)?

The `invoice_url` is already on the draft order from creation — you can `GET` the draft and read it, then deliver the link however you like (SMS, WhatsApp, your own email):

```
GET /admin/api/2024-10/draft_orders/5001.json
→ draft_order.invoice_url = "https://himangs-tiramisu.myshopify.com/.../invoices/abc123"
```

So there are two delivery styles: let **Shopify email it** (`send_invoice`), or **grab the URL** and send it yourself. Sending via Shopify is what flips the status to `invoice_sent`.

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

A copy lives in [`examples/send-invoice.js`](../examples/send-invoice.js).

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

Same effect: email the invoice, status → `invoice_sent`, `invoiceUrl` available. Check `userErrors` as always.

---

## Production Considerations

- **`invoice_sent` is not income.** The status only means "we asked." Don't record revenue until the order exists and is `paid` (Chapter 06).
- **Learn of payment via webhooks, not polling.** When Alice pays, Shopify creates the order and fires `orders/create`/`orders/paid`. Subscribe to those ([Section 04](../04-webhooks/)) rather than repeatedly `GET`-ting the draft.
- **Invoice links can be re-sent and can linger.** Alice may ignore the email. Decide on reminders and an expiry policy so stale `invoice_sent` drafts don't accumulate.
- **Use the hosted checkout — don't rebuild it.** The `invoice_url` keeps card data off your systems (PCI, [Section 01](../01-introduction/01-what-is-shopify.md)). Delivering the link is enough; you never handle the payment form.
- **Deliverability matters.** If you rely on Shopify's email, invoices can land in spam. For important B2B flows, some merchants share the `invoice_url` through their own trusted channel instead.

---

## Common Misconceptions

**❌ "Sending the invoice charges Alice."**
Reality: It only delivers a pay link. Money moves when she completes the checkout.

**❌ "Sending the invoice creates the order."**
Reality: No. The order is created when she pays (Chapter 06). Until then the draft is `invoice_sent`, `order_id` still `null`.

**❌ "The `invoice_url` only exists after I call send_invoice."**
Reality: It's on the draft from creation. `send_invoice` *delivers* it (and sets the status); you can also just read the URL and share it yourself.

**❌ "I should build my own payment page for a nicer experience."**
Reality: The hosted checkout handles PCI and payment methods for you. Rebuilding it forfeits that protection for little gain in this flow.

---

## Frequently Asked Questions

**Q: What's the difference between `invoice_url` and `send_invoice`?**
`invoice_url` is the pay link (present from draft creation). `send_invoice` is the action that emails that link to the customer and sets the draft's status to `invoice_sent`.

**Q: Can I send the link without using Shopify's email?**
Yes — `GET` the draft, read `invoice_url`, and deliver it through any channel. Note that skipping `send_invoice` means the status won't automatically become `invoice_sent`.

**Q: How will I know when Alice pays?**
Via webhooks (`orders/create` / `orders/paid`), covered in [Section 04](../04-webhooks/). Don't poll the draft in a loop.

**Q: Can I resend the invoice?**
Yes — call `send_invoice` again. Useful for reminders.

**Q: Does the customer need a Shopify account to pay?**
No. The hosted checkout supports guest payment; Alice just opens the link and pays.

---

## Interview Questions

1. Distinguish `invoice_url` from the `send_invoice` action.
2. Does sending an invoice charge the customer or create an order? What does?
3. When does `invoice_url` first exist on a draft order?
4. Give two ways to deliver the invoice link, and note which one sets `invoice_sent`.
5. How should your system find out that the customer paid?
6. Why not build your own payment page instead of using the hosted checkout?

---

## Summary

- The draft order's **`invoice_url`** is a link to a **hosted checkout** pre-filled with Alice's order; it exists from the moment the draft is created.
- **`POST /draft_orders/{id}/send_invoice.json`** emails Alice that link and moves the draft to **`invoice_sent`**. You can instead **read `invoice_url`** and deliver it yourself.
- Sending an invoice **neither charges the customer nor creates an order** — only her completing the checkout does (Chapter 06). So `invoice_sent` is **not revenue**, and you should learn of payment via **webhooks**.
- The hosted checkout keeps **card data off your systems**; GraphQL mirrors this with `draftOrderInvoiceSend`.

---

## What's Next

Alice pays — or Himang collects payment another way. Either path ends the same: a real order.

→ **Next chapter: [Completing a Draft Order → Order](06-completing-a-draft-order.md)** — the final step of the pipeline, where the draft becomes a committed Order and `order_id` finally fills in.
