# The Shopify Data Model

A Shopify store, to an engineer, is a set of **objects** that relate to each other — products, variants, customers, orders, and a few more. Almost every API call reads or writes one of them.

This chapter is a **map**, not a deep dive. Finish it and you can name every core object, say what each does, and see how they connect. Later chapters zoom in — but zooming in only works with the whole picture in view, so we build that first.

---

## Business Problem

You've been handed Himang's store and told: "Write a service that takes phone orders." Before any code, you need to answer:

- Where do the *tiramisus* live, and how do I reference the exact one Alice wants?
- Where does *Alice* live as a record?
- What object represents "an order that isn't paid yet"?
- What turns into a real, paid **order**, and what happens after?

You can't design anything until you know the pieces and how they relate.

---

## Mental Model

A Shopify store is a **graph of objects** — an ER diagram, essentially. Two natural halves:

- **Catalog half** — what's *for sale*: **Products** and their **Variants**. Fairly static; Himang's menu.
- **Commerce half** — what *happens on a sale*: **Customers**, **Draft Orders**, **Orders**, **Line Items**, **Transactions**, **Fulfillments**. Dynamic; the flow of a sale.

A customer meets the catalog at the moment of a sale, which flows through the commerce half.

---

## Architecture: the whole map

Every box is an object; every arrow a relationship. Later chapters walk these one at a time.

```
                          ┌──────────────────────────┐
                          │          STORE            │
                          │      (the tenant)          │
                          └──────────────────────────┘
                             contains everything below

   ── CATALOG ─────────────────────────────────────────────────────

     ┌─────────────┐   has many    ┌──────────────┐
     │   PRODUCT    │ ────────────► │   VARIANT     │  price, SKU,
     │ (catalog     │               │ (sellable     │  inventory live
     │  concept)    │               │  unit)        │  HERE
     └─────────────┘               └──────────────┘
           ▲                               ▲
           │ grouped by (optional)         │ the thing that gets bought
     ┌─────────────┐                       │
     │ COLLECTION   │                       │
     │ (a group of  │                       │
     │  products)   │                       │
     └─────────────┘                       │
                                           │
   ── COMMERCE ─────────────────────────────┼───────────────────────

     ┌─────────────┐                        │
     │  CUSTOMER    │                        │ referenced by
     │ (the buyer)  │                        │
     └─────────────┘                        │
           │ places                         │
           ▼                                │
     ┌──────────────┐   contains    ┌──────────────┐
     │ DRAFT ORDER   │ ───────────► │  LINE ITEM    │──► points to a VARIANT
     │ (a quotation, │              │ (qty × variant│    (+ quantity, price)
     │  not yet paid)│              │  at a price)  │
     └──────────────┘              └──────────────┘
           │ when accepted & paid,
           │ becomes a real
           ▼
     ┌──────────────┐   contains    ┌──────────────┐
     │    ORDER      │ ───────────► │  LINE ITEM    │──► points to a VARIANT
     │ (committed    │              └──────────────┘
     │  sale)        │
     └──────────────┘
        │        │
   pays │        │ ships
        ▼        ▼
  ┌───────────┐ ┌───────────────┐
  │TRANSACTION│ │  FULFILLMENT   │
  │ (money    │ │ (getting goods │
  │  moved)   │ │  to the buyer) │
  └───────────┘ └───────────────┘
```

Three things to read off this map:

1. **The line item is the connector.** An order doesn't "contain products" — it contains **line items**, each pointing to a **variant** with a quantity and price. This is why transactions reference variant IDs, not product IDs.
2. **Draft Order and Order are two objects, not one.** The draft is the "before," the order the "after." One becomes the other — the heart of this repo.
3. **Payment and fulfillment are separate branches** off an order. Money (**Transaction**) and goods (**Fulfillment**) are independent — an order can be paid-but-unfulfilled or fulfilled-but-unpaid.

---

## Internal Working: one-sentence tour

| Object | What it is | Who creates it |
|--------|-----------|----------------|
| **Store** (`shop`) | The tenant containing everything else ([Section 01](../01-introduction/03-merchants-stores-and-the-admin.md)). | Shopify, at signup |
| **Product** | A catalog concept — title, description, images. Not directly purchasable. | Merchant / your code |
| **Variant** | A specific purchasable version; holds price, SKU, inventory. **The thing bought.** | Created with the product |
| **Collection** | An optional grouping of products. Organizational only. | Merchant / your code |
| **Customer** | A buyer record — name, email, address, history. | Merchant, checkout, or your code |
| **Draft Order** | A *quotation* — a proposed, unpaid order. Editable, invoiceable. | Merchant / your code (never the shopper) |
| **Line Item** | One row in an order/draft: a variant × quantity at a price. The catalog link. | Created inside the order |
| **Order** | A *committed* sale. From a completed checkout or draft. | Shopify |
| **Transaction** | A record of money moving (auth, capture, refund). | Shopify / payment provider |
| **Fulfillment** | A record of goods shipped for an order. | Merchant / your code / an app |

Two patterns:

- **You create catalog objects; Shopify usually creates commerce objects.** You define products and draft orders, but an *Order* is created *by Shopify* when a checkout or draft completes — you don't `POST` one.
- **"Who creates it" tells you the API direction.** Objects you create → you write them via the Admin API. Objects Shopify creates → you learn of them via **webhooks** ([Section 04](../04-webhooks/)).

---

## REST & GraphQL

Both APIs expose the same objects:

- **REST** — an endpoint family per object (`/products`, `/customers`, `/draft_orders`, `/orders`). Relationships appear as nested arrays (variants inside a product) or separate endpoints (`/orders/{id}/transactions.json`).
- **GraphQL** — the same objects as *types* (`Product`, `ProductVariant`, `Customer`, `DraftOrder`, `Order`), traversable in one query — fetch an order, its line items, and each variant at once.

Authentication is [Section 03](../03-rest-api/). The takeaway: **the map you drew is the map both APIs expose.**

---

## Production Considerations

- **Model your database around variant IDs and order IDs** — the stable handles for "what was bought" and "what sold." Most bugs trace to keying off the wrong thing (a product ID, a mutable SKU).
- **Respect who owns creation.** Don't `POST` an order like a product; orders arise from checkouts or draft completion.
- **Learn about commerce objects asynchronously** — via **webhooks**, not polling, since Shopify creates them.
- **The two halves need different sync strategies** — catalog changes rarely (cacheable); commerce is a stream of events.

---

## Common Misconceptions

**❌ "An order contains products."**
It contains **line items**, each referencing a **variant**. The transaction happens at the variant level.

**❌ "A draft order and an order are one object in different states."**
Two distinct objects with different endpoints, purposes, and lifecycles. A draft can *become* an order.

**❌ "I create orders like products — just POST one."**
You create products and draft orders freely, but real orders usually come into existence *through Shopify* (a completed checkout or draft).

**❌ "Payment and fulfillment are one step."**
Separate objects (Transaction vs. Fulfillment) that happen independently and out of order.

---

## Frequently Asked Questions

**Q: Do I need to memorize this diagram now?**
No — just *recognize* the objects and their relationships. It's a reference to return to, so the deep dives don't float without context.

**Q: Why start with a map instead of teaching each object in turn?**
Each object only makes sense relative to the others. "Variant" means little until you know a line item points at it. Connections first makes later chapters click.

**Q: Are these all Shopify's objects?**
No — the *core* ones for commerce and the draft-order pipeline. Others (discounts, gift cards, metafields, inventory locations) come up as needed.

**Q: Where does the shopping cart fit?**
On the storefront during browsing; at checkout it becomes a checkout, which if completed produces an **order**. The draft-order flow is the merchant-driven parallel. ([Section 08](../08-checkout/).)

---

## Interview Questions

1. Name the two halves and two objects in each.
2. What object connects an order to the catalog, and what does it point at?
3. Why does an order reference variants, not products?
4. Are a draft order and an order the same object? Explain.
5. Which objects do *you* create vs. *Shopify*? What does that imply about how you learn of them?
6. Why are payment and fulfillment separate objects?

---

## Summary

- A store is a **graph of objects**: a **catalog half** (Product → Variant, grouped by Collections) and a **commerce half** (Customer, Draft Order, Order, Line Item, Transaction, Fulfillment).
- **Variants are the sellable units**; **line items** connect an order to variants — why transactions use variant IDs.
- **Draft Order and Order are distinct**; one becomes the other — the spine of this repo.
- **You create catalog/draft objects; Shopify creates orders, transactions, fulfillments** — so you learn of them via webhooks.
- **Payment and fulfillment are separate branches** that happen independently.
- **Both APIs expose this same map.**

---

## What's Next

→ **Next: [Products vs. Variants](02-products-vs-variants.md)** — the catalog pair beginners most often get wrong. Then Customers, then the Draft Order.
