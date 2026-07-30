# `express.raw()` vs `express.json()`

Now you write the handler — and hit one of the most infamous webhook bugs. Parse the body with the usual `express.json()` and your signature verification (next chapter) will *always fail*, for a reason invisible until you see it.

---

## Business Problem

To trust a webhook you verify the **HMAC signature** in the `X-Shopify-Hmac-Sha256` header (Chapter 04). Verification recomputes a signature over the body and compares it. For a match, you must hash **the exact bytes Shopify hashed** — the raw body, byte for byte.

The trap — the reflexive Express setup:

```javascript
app.use(express.json());   // parse every request body as JSON
```

This parses the bytes into a JavaScript object, and **the original raw bytes are gone**. Re-serializing (`JSON.stringify`) doesn't reproduce them — key order, spacing, and unicode escaping can differ. Hash the re-serialized version and you get a *different* signature. Verification fails 100% of the time, even on a genuine webhook.

> The body parser destroys the very thing verification needs: the original bytes.

---

## Mental Model

> HMAC verification is a **fingerprint check on exact bytes**. `express.json()` gives you the body's *meaning* (a parsed object) but throws away the *bytes*. To verify, capture the body as **raw bytes** — that's `express.raw()`.

Two ideas:

- **A stream is read once.** An HTTP body is a byte stream; the first middleware to read it *consumes* it. If `express.json()` reads and parses it, nothing's left to read as raw bytes.
- **Parsed ≠ original.** `{"b":1,"a":2}` and `{"a":2,"b":1}` are the same object but different bytes. A byte fingerprint cares; a parsed object has erased the difference.

Analogy: verifying a signature on a *retyped photocopy* is pointless — you need the original. `express.raw()` hands you the original.

---

## Architecture

```
   BROKEN (express.json on the webhook route)

   Shopify ─POST raw bytes─► express.json() ─parses→ req.body = {object}
                                     │
                              raw bytes discarded
                                     │
   verify: HMAC(JSON.stringify(req.body)) ≠ header   ✗ always fails


   CORRECT (express.raw on the webhook route)

   Shopify ─POST raw bytes─► express.raw() ─keeps→ req.body = <Buffer ...>
                                     │
                          exact original bytes preserved
                                     │
   verify: HMAC(req.body) == header   ✓   → then JSON.parse(req.body) to use it
```

Use `express.raw()` on the webhook route, verify against the raw bytes, then parse the JSON yourself.

---

## Implementation

Apply `express.raw()` only to the webhook path; the rest of the app keeps `express.json()`:

```javascript
const express = require("express");
const app = express();

// Webhook route: capture the RAW body as a Buffer (bytes preserved).
// `type: "application/json"` tells express.raw to handle JSON-typed requests
// as raw bytes instead of parsing them.
app.post(
  "/webhooks/orders",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const rawBody = req.body; // a Buffer — the exact bytes Shopify sent

    // 1. Verify the HMAC against the RAW bytes (chapter 04 fills this in).
    // const ok = verifyShopifyWebhook(rawBody, req.get("X-Shopify-Hmac-Sha256"));
    // if (!ok) return res.sendStatus(401);

    // 2. ONLY AFTER verifying, parse the JSON yourself.
    const order = JSON.parse(rawBody.toString("utf8"));
    console.log("Verified order:", order.id, order.financial_status);

    res.sendStatus(200); // acknowledge fast
  }
);

// Other, non-webhook routes can safely use the JSON parser.
app.use(express.json());

app.listen(3000);
```

Three things that matter:

- **`express.raw({ type: "application/json" })`** makes `req.body` a **Buffer** of the exact bytes.
- **Verify first, parse second** — run the HMAC check on `rawBody`, call `JSON.parse` only after it passes.
- **Scope it to the route** — normal routes keep `express.json()`. The raw parser is attached before any global `express.json()` can grab the body.

---

## The famous question: why can't `express.json()` parse it afterward?

> **Q: If I read the body first, why can't I parse it again afterward?**
>
> **A: A request body is a stream, consumed once.** Whichever middleware reads it first drains the stream. After `express.raw()` reads it into a Buffer, there are no more bytes, so a later `express.json()` finds an empty stream. You read once (as raw bytes), verify, then `JSON.parse` the Buffer you already hold.

That single fact — **the stream is consumed once** — explains both why `express.json()` before verification is fatal *and* why you parse the Buffer manually.

---

## Production Considerations

- **`express.raw()` only on webhook routes** — a global raw parser breaks normal JSON APIs.
- **Never `JSON.parse` before verifying** — treat the raw body as untrusted until the HMAC passes.
- **Match the `type`** — `express.raw({ type: "application/json" })` must cover the content type Shopify sends, or `req.body` won't be populated.
- **Beware other body-consuming middleware** (logging, proxies) reading the body first — same "stream consumed" problem.
- **Framework-agnostic:** in any stack, verify against the raw bytes, not a re-serialized parse.

---

## Common Misconceptions

**❌ "`express.json()` is fine; I'll `JSON.stringify(req.body)` to verify."**
Re-serializing doesn't reproduce the original bytes. The HMAC won't match.

**❌ "I can read raw and also let `express.json()` parse it."**
The stream is consumed once. Parse the Buffer yourself.

**❌ "Parse the JSON, then verify — same thing."**
Verify the raw bytes *first*; parse (and trust) only after.

**❌ "Use `express.raw()` globally to be safe."**
That breaks every JSON route. Scope it to webhook paths.

---

## Frequently Asked Questions

**Q: Why does `express.json()` break verification?**
It parses and discards the original bytes; you then hash a re-serialized version, which differs from what Shopify hashed.

**Q: Why can't I read the body twice?**
It's a one-shot stream. Read once (raw), verify, then `JSON.parse` the buffer.

**Q: Do I still get the parsed object?**
Yes — `JSON.parse(rawBody.toString("utf8"))` after verifying.

**Q: Express-specific?**
No. Every framework must verify against the raw bytes; only the names differ.

**Q: Where exactly does `express.raw()` go?**
As route-level middleware on the webhook path, before any global `express.json()`.

---

## Interview Questions

1. Why does `express.json()` break verification?
2. What does `express.raw()` give you, and why does verification need it?
3. Explain "a body is read once" and its two consequences.
4. Why doesn't `JSON.stringify(req.body)` reproduce the signed bytes?
5. In what order must you verify and parse?
6. Why scope `express.raw()` to the webhook route?
7. Is this Express-specific? The general rule?

---

## Summary

- Verification must hash the **exact raw bytes**. **`express.json()` parses and discards** them, so verifying a re-serialized object **always fails**.
- Use **`express.raw({ type: "application/json" })`** on the **webhook route** to keep `req.body` as a **Buffer**.
- **Verify first, parse second**; never trust unverified input.
- A body is a **one-shot stream** — read once; that's why you parse the Buffer manually.
- Scope raw parsing to webhook paths; the principle (**hash the raw bytes**) is **framework-independent**.

---

## What's Next

You can capture the raw bytes. Now verify the signature over them.

→ **Next: [HMAC, SHA-256, and `timingSafeEqual`](04-hmac-sha256-timingsafeequal.md)** — what the signature is, how to recompute it, and why comparison must be constant-time.
