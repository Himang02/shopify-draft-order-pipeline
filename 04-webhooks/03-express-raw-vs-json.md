# `express.raw()` vs `express.json()`

You have a public URL forwarding to your local server. Now you write the handler — and immediately hit one of the most infamous webhook bugs. It looks trivial: parse the JSON body, done. But do that with the usual `express.json()` and your signature verification (next chapter) will *always fail*, for a reason that's invisible until you understand it. This chapter is that reason.

---

## Business Problem

Shopify `POST`s a webhook. To trust it, you must verify the **HMAC signature** in the `X-Shopify-Hmac-Sha256` header (Chapter 04). That verification recomputes a signature over the request body and compares it to the header. For the two to match, you must hash **the exact same bytes Shopify hashed** — the raw request body, byte for byte.

Here's the trap. The reflexive Express setup is:

```javascript
app.use(express.json());   // parse every request body as JSON
```

This parses the incoming bytes into a JavaScript object. And once it's parsed into an object, **the original raw bytes are gone** — you only have a re-serializable *representation*. Re-serializing it (`JSON.stringify`) does **not** reliably reproduce the original bytes: key order, spacing, and unicode escaping can all differ. Hash the re-serialized version and you get a *different* signature than Shopify computed. Verification fails 100% of the time, even though the webhook is perfectly genuine.

> The body parser destroys the very thing verification needs: the original, unmodified bytes.

---

## Mental Model

> HMAC verification is a **fingerprint check on exact bytes**. `express.json()` gives you the *meaning* of the body (a parsed object) but throws away the *exact bytes*. To verify, you must capture the body as **raw bytes** — that's what `express.raw()` is for.

Two ideas make this stick:

- **A stream can be read only once.** An HTTP request body is a stream of bytes. Whichever middleware reads it first *consumes* it. If `express.json()` consumes and parses it, there's nothing left for anything else to read as raw bytes. (This is also the answer to a famous beginner question — more below.)
- **Parsed ≠ original.** `{"b":1,"a":2}` and `{"a":2,"b":1}` are the *same object* but *different bytes*. A fingerprint over bytes cares about the difference; a parsed object has already erased it.

Analogy: verifying a signature on a *photocopy you retyped* is pointless — you need the *original document*. `express.raw()` hands you the original; `express.json()` hands you a retyped copy.

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

The fix is to use `express.raw()` **on the webhook route**, verify against those raw bytes, and only *then* parse the JSON yourself.

---

## Implementation

The correct setup applies `express.raw()` only to the webhook path, while the rest of the app can still use `express.json()`:

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

The three things that matter:

- **`express.raw({ type: "application/json" })`** on the webhook route makes `req.body` a **Buffer** of the exact bytes — not a parsed object.
- **Verify first, parse second.** Run the HMAC check against `rawBody`, and only call `JSON.parse` once it passes. Never trust the contents before verification.
- **Scope it to the route.** `express.raw()` goes *only* on the webhook path. Your normal API routes keep `express.json()`. Order matters: the raw parser is attached to the specific route before any global `express.json()` can grab the body.

---

## The famous question: why doesn't `express.json()` work afterward?

This is one of the beginner questions this repository deliberately preserves, because answering it teaches how HTTP bodies work.

> **Q: If I call `express.raw()` (or `express.json()`) first, why can't I also parse the body again afterward?**
>
> **A: Because a request body is a stream, and a stream can be consumed only once.** The bytes flow in once; whichever middleware reads them first drains the stream. After `express.raw()` has read the body into a Buffer, there are no more bytes to read — so a later `express.json()` on the same request finds an empty stream. You don't re-read the body; you read it once (as raw bytes), verify, then `JSON.parse` the Buffer you already hold.

That single fact — **the stream is consumed once** — explains both why `express.json()` before verification is fatal *and* why you parse the Buffer manually instead of re-parsing the request.

---

## Production Considerations

- **Put `express.raw()` only on webhook routes.** A global raw parser would break your normal JSON APIs. Scope it precisely.
- **Never `JSON.parse` before verifying.** Treat the raw body as untrusted until the HMAC passes. Parsing (and certainly *acting on*) unverified input is the vulnerability this whole section guards against.
- **Match the `type`.** `express.raw({ type: "application/json" })` must cover the content type Shopify sends. If the type doesn't match, `express.raw` won't populate `req.body` and you'll be confused.
- **Beware other body-consuming middleware.** Any logging or proxy middleware that reads the body before your raw parser can create the same "stream already consumed" problem. Know your middleware order.
- **Framework-agnostic principle.** This isn't an Express quirk. In *any* stack, verify webhooks against the raw request bytes, not a re-serialized parse. The names change; the rule doesn't.

---

## Common Misconceptions

**❌ "`express.json()` is fine; I'll just `JSON.stringify(req.body)` to verify."**
Reality: Re-serializing a parsed object doesn't reproduce the original bytes (key order, spacing, escaping differ). The HMAC won't match. You need the raw bytes.

**❌ "I can read the body as raw and then also let `express.json()` parse it."**
Reality: The body stream is consumed once. After the raw parser reads it, `express.json()` finds nothing. Parse the Buffer yourself instead.

**❌ "I'll parse the JSON, then verify — same thing."**
Reality: Order matters for both security and correctness. Verify the raw bytes *first*; only parse (and trust) after it passes.

**❌ "Use `express.raw()` globally to be safe."**
Reality: That breaks every normal JSON route. Scope raw parsing to webhook paths only.

---

## Frequently Asked Questions

**Q: Why does verification fail if I use `express.json()`?**
Because it parses the bytes into an object and discards the originals. Your verification then hashes a *re-serialized* version, which differs from what Shopify hashed. Different bytes → different signature → mismatch.

**Q: Why can't I read the body twice?**
An HTTP request body is a one-shot stream. The first middleware to read it consumes it. So you read once (as raw bytes), verify, then `JSON.parse` the buffer you kept.

**Q: Do I still get to use the parsed object?**
Yes — after verifying, call `JSON.parse(rawBody.toString("utf8"))` yourself. You get the object; you just produce it *after* the security check, from bytes you controlled.

**Q: Is this an Express-specific problem?**
No. Every framework must verify webhooks against the raw request bytes. The middleware names differ; the underlying rule (hash the exact bytes) is universal.

**Q: Where exactly do I put `express.raw()`?**
As the route-level middleware on the webhook path, before any global `express.json()`. That way the webhook route reads raw bytes and other routes still get parsed JSON.

---

## Interview Questions

1. Why does `express.json()` break Shopify webhook verification?
2. What does `express.raw()` give you that `express.json()` doesn't, and why does verification need it?
3. Explain "a request body can be read only once" and its two consequences here.
4. Why doesn't `JSON.stringify(req.body)` reliably reproduce the bytes Shopify signed?
5. In what order must you verify and parse, and why?
6. Why should `express.raw()` be scoped to the webhook route rather than applied globally?
7. Is this problem specific to Express? What's the framework-independent rule?

---

## Summary

- HMAC verification must hash the **exact raw bytes** Shopify sent. **`express.json()` parses and discards** those bytes, so verification against a re-serialized object **always fails**.
- Use **`express.raw({ type: "application/json" })`** on the **webhook route** to keep `req.body` as a **Buffer** of the original bytes.
- **Verify first, parse second:** run the HMAC check on the raw Buffer, and only then `JSON.parse` it. Never trust unverified input.
- A request **body is a one-shot stream** — read once. That's why you can't `express.json()` after reading raw, and why you parse the Buffer manually.
- Scope raw parsing to webhook paths; the principle (**hash the raw bytes**) is **framework-independent**.

---

## What's Next

You can now capture the raw bytes safely. Time to actually verify the signature over them — the security core of the whole section.

→ **Next chapter: [HMAC, SHA-256, and `timingSafeEqual`](04-hmac-sha256-timingsafeequal.md)** — what the signature is, how to recompute it, and why comparing it needs a constant-time function.
