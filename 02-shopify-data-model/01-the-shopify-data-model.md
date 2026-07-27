# The Shopify Data Model

Section 01 stayed at the level of "what Shopify is." Now we open the store and look at what's *inside* it. A Shopify store is, from an engineer's point of view, a set of **objects** that relate to each other — products, variants, customers, orders, and a handful more. Almost every API call you'll ever write reads or writes one of these objects.

This chapter is a **map**, not a deep dive. The goal is that you finish it able to name every core object, say in one sentence what each is for, and — most importantly — see *how they connect*. Later chapters zoom into the tricky ones. But zooming in only works if you already have the whole picture, so we build the picture first.

---

## Business Problem

Imagine you've just been handed access to Himang's store and told: "Write a service that takes phone orders." Before you write a line of code, you need to answer:

- Where do the *tiramisus* live, and how do I reference the exact one Alice wants?
- Where does *Alice* live as a record?
- What object represents "an order that isn't paid yet"?
- What turns into a real, paid **order**, and what happens to it after?
- Which of these do I create, and which does Shopify create for me?

You can't design anything until you know the pieces and their relationships. Jumping straight into `Product vs Variant` (the next chapter) without this map is how people end up confused about where a concept fits. So this chapter gives you the pieces and the wiring; the rest of the section fills in detail.

---

## Mental Model

Think of a Shopify store as a **graph of objects**, like an ER diagram you'd draw for any backend system — because that's exactly what it is.

There are two natural halves:

- **The catalog half** — what's *for sale*: **Products** and their **Variants**. Static-ish; it's Himang's menu.
- **The commerce half** — what *happens when someone buys*: **Customers**, **Draft Orders**, **Orders**, **Line Items**, **Transactions**, and **Fulfillments**. Dynamic; it's the flow of a sale.

A **Customer** meets the **catalog** at the moment of a sale, and that sale flows through the commerce half:

```
   CATALOG (what's for sale)          COMMERCE (what happens on a sale)

   Product ──has many──► Variant  ◄────referenced by──── Line Item
                                                             │
                                                        belongs to
                                                             ▼
      Customer ───────────────────────────────►  Draft Order / Order
```

Don't memorize this yet — just register the shape: **a catalog of variants, a customer, and an order that ties a customer to the variants they bought.** Everything else hangs off that spine.

---

## Architecture: the whole map

Here is the entire core data model on one page. Every box is an object; every arrow is a relationship. The chapters after this one walk these boxes one at a time.

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

A few things to *read off* this map right now — they're the payoff of drawing it:

1. **The line item is the connector.** An order (or draft order) doesn't "contain products." It contains **line items**, and each line item points to a **variant** with a quantity and price. This is the structural reason transactions reference variant IDs, not product IDs.
2. **Draft Order and Order are two objects, not one.** The draft order is the "before"; the order is the "after." One can become the other. This is the heart of this repository, and it gets its own chapters.
3. **Payment and fulfillment are separate branches off an order.** Money moving (**Transaction**) and goods shipping (**Fulfillment**) are independent — an order can be paid but unfulfilled, or fulfilled but unpaid. We flagged this in [Chapter 02 of Section 01](../01-introduction/02-shopify-vs-amazon.md); here you can see *why* — they're different objects.

---

## Internal Working: a one-sentence tour of each object

Here is every core object, in the order the rest of the section will cover them. One or two sentences each — just enough to know what it is and where it fits.

| Object | What it is | Who creates it |
|--------|-----------|----------------|
| **Store** (`shop`) | The tenant that contains everything else. Covered in [Section 01](../01-introduction/03-merchants-stores-and-the-admin.md). | Shopify, at signup |
| **Product** | A catalog concept — title, description, images. Not directly purchasable. | Merchant / your code |
| **Variant** | A specific purchasable version of a product; holds price, SKU, inventory. **The thing a customer buys.** | Created with the product |
| **Collection** | An optional grouping of products (e.g. "Bestsellers"). Purely organizational. | Merchant / your code |
| **Customer** | A person who can place orders; holds name, email, address, order history. | Merchant, checkout, or your code |
| **Draft Order** | A *quotation* — a proposed order that isn't paid yet. Editable. Can be sent as an invoice. | Merchant / your code (never the shopper directly) |
| **Line Item** | One row inside an order/draft order: a variant × a quantity, at a price. The link between an order and the catalog. | Created inside the order |
| **Order** | A *committed* sale. Created when a checkout is completed or a draft order is paid. | Shopify (from checkout or draft completion) |
| **Transaction** | A record of money moving for an order (authorization, capture, refund). | Shopify / payment provider |
| **Fulfillment** | A record of goods being sent to the customer for an order. | Merchant / your code / an app |

Two patterns worth noticing across that table:

- **Catalog objects you mostly create; commerce objects Shopify often creates for you.** You define products and variants. But an *Order* is typically created *by Shopify* when a checkout completes — you don't `POST` an order into existence the way you might expect. (The draft-order flow is the interesting exception, which is why it's this repo's focus.)
- **"Who creates it" tells you the direction of the API.** Objects you create → you'll use the Admin API to write them. Objects Shopify creates → you'll often learn about them via *webhooks* ([Section 04](../04-webhooks/)).

---

## REST & GraphQL

Every object above is exposed by both APIs; the mapping is direct, and mostly you can guess the names:

- **REST** gives each object its own endpoint family: `/products`, `/customers`, `/draft_orders`, `/orders`, and so on. A relationship like "a product's variants" appears as a nested array in the JSON (you saw this in the product example — variants live inside the product). Some relationships are separate endpoints (e.g. an order's transactions at `/orders/{id}/transactions.json`).
- **GraphQL** exposes the same objects as *types* (`Product`, `ProductVariant`, `Customer`, `DraftOrder`, `Order`) and lets you traverse the relationships in a single query — fetch an order *and* its line items *and* each line item's variant at once. This "follow the graph in one request" ability is the reason it's called GraphQL, and it maps naturally onto the diagram above.

We're not calling anything yet — authentication is [Section 03](../03-rest-api/). The takeaway here is just: **the map you drew is the map both APIs expose.** Learn the objects and their relationships once, and both API styles become "how do I say this in REST vs. GraphQL," not "what even is this."

---

## Production Considerations

- **Model your own database around variant IDs and order IDs.** These are the stable, unique handles for "what was bought" and "what sale happened." Most integration bugs trace back to keying off the wrong thing (a product ID, or a mutable SKU).
- **Respect who owns creation.** Don't try to `POST` an order as if it were a product; orders generally arise from checkouts or draft-order completion. Fighting the model leads to dead ends.
- **Expect to learn about commerce objects asynchronously.** Because Shopify creates orders/transactions/fulfillments, your system usually finds out via **webhooks**, not by polling. Design for "Shopify will tell me," not "I'll ask repeatedly."
- **Keep the halves in mind when planning sync.** Catalog data (products/variants) changes rarely and can be cached; commerce data (orders) is a stream of events. They deserve different sync strategies.

---

## Common Misconceptions

**❌ "An order contains products."**
Reality: An order contains **line items**, and each line item references a **variant**. Products are the catalog grouping; the transaction happens at the variant level.

**❌ "A draft order and an order are the same object in different states."**
Reality: They're **two distinct objects**. A draft order can *become* an order, but they have different endpoints, different purposes, and different lifecycles. (Whole chapters ahead.)

**❌ "I create orders the same way I create products — just POST one."**
Reality: You freely create products and draft orders, but real orders usually come into existence *through Shopify* (a completed checkout, or a completed draft order). The creation direction differs by object.

**❌ "Payment and fulfillment are one step."**
Reality: They're separate objects (Transaction vs. Fulfillment) and can happen independently and out of order. An order can be paid-but-unshipped or shipped-but-unpaid.

---

## Frequently Asked Questions

**Q: Do I need to memorize this whole diagram now?**
No. You need to *recognize* the objects and their rough relationships. The detail comes in the following chapters. This map is a reference to come back to — its job is to make sure the deep dives never feel like they're floating without context.

**Q: Why start with a map instead of just teaching each object in turn?**
Because each object only makes sense in relation to the others. "Variant" means little until you know a line item points at it; "draft order" means little until you know it becomes an order. Seeing the connections first makes every later chapter click faster.

**Q: Are these all the objects Shopify has?**
No — these are the *core* ones for understanding commerce and the draft-order pipeline. Shopify has many more (discounts, gift cards, metafields, inventory locations, and so on). We introduce those as they become relevant rather than dumping them here.

**Q: Where does the shopping cart fit?**
The cart lives on the storefront during browsing; when the shopper checks out, it becomes a checkout, which — if completed — produces an **order**. The draft-order flow is a *merchant-driven* parallel to that shopper-driven path. We cover checkout in [Section 08](../08-checkout/).

---

## Interview Questions

1. Name the two halves of the Shopify data model and give two objects in each.
2. What object connects an order to the catalog, and what does it point at?
3. Why does an order reference variants rather than products?
4. Are a draft order and an order the same object? Explain.
5. Which core objects do *you* typically create, and which does *Shopify* create for you? What does that imply about how you learn of them (API vs. webhook)?
6. Why are payment and fulfillment modeled as separate objects?

---

## Summary

- A Shopify store is a **graph of objects**: a **catalog half** (Product → Variant, optionally grouped by Collections) and a **commerce half** (Customer, Draft Order, Order, Line Item, Transaction, Fulfillment).
- **Variants are the sellable units**, and **line items** are what connect an order (or draft order) to those variants — the structural reason transactions use variant IDs.
- **Draft Order and Order are distinct objects**; one can become the other. This transition is the spine of this repository.
- **You create catalog and draft-order objects; Shopify usually creates orders, transactions, and fulfillments** — so you often learn about the latter via webhooks.
- **Payment (Transaction) and fulfillment (Fulfillment) are separate branches** off an order and can happen independently.
- Both **REST and GraphQL expose this same map** — learn the objects once, and the API styles are just two ways to say the same thing.

---

## What's Next

You have the map. Time to zoom into the boxes.

→ **Next chapter: [Products vs. Variants](02-products-vs-variants.md)** — the catalog pair, and the distinction beginners most often get wrong. From there: Customers, then the Draft Order the whole pipeline revolves around.
