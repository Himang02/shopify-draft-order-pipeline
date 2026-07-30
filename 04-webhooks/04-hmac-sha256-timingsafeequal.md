# HMAC, SHA-256, and `timingSafeEqual`

The security core. You have the raw bytes ([Chapter 03](03-express-raw-vs-json.md)); now verify the webhook genuinely came from Shopify and wasn't tampered with. The tool is an **HMAC signature** — explained from first principles, plus why the comparison must be **constant-time**.

---

## Business Problem

Your endpoint is a public URL. Anyone can `POST` to it — including:

```
POST /webhooks/orders
{ "id": 9999, "financial_status": "paid", "total_price": "1000000.00" }
```

Trust the body and you've "processed" a fake million-rupee order. **A URL is not authentication.** You need proof a `POST` really came from Shopify and wasn't altered. That proof is the HMAC signature in every webhook.

---

## Mental Model

Built from pieces:

- **Hash (SHA-256)** — turns any bytes into a fixed-size fingerprint; change one byte and it changes completely. But a plain hash proves nothing about *origin* — anyone can hash anything.
- **Shared secret** — Shopify and your server both know the **webhook signing secret**. Nobody else does. (This is *not* the API secret — see below.)
- **HMAC = hash keyed by the secret.** It mixes the message with the secret, so **only someone who knows the secret can produce a valid HMAC** for a given body.

> A valid HMAC proves two things: **authenticity** (from someone who knows the secret — Shopify) and **integrity** (the body wasn't changed).

Verification:

> Shopify sends `HMAC-SHA256(secret, body)` in a header. You compute `HMAC-SHA256(secret, raw_body)` and check equality. Equal → genuine; not → reject.

An attacker can craft a body but **can't** compute a matching signature without the secret.

---

## Architecture

```
   SHOPIFY SIDE                                YOUR SIDE

   body bytes ─┐                               raw body bytes ─┐   (chapter 03!)
               ├─ HMAC-SHA256(secret, body)                    ├─ HMAC-SHA256(secret, raw)
   secret ─────┘        │                      secret ─────────┘        │
                        ▼                                               ▼
        X-Shopify-Hmac-Sha256: "9Xk3...=="  ───compare───►   your computed digest

               equal (constant-time)?  ──yes──►  genuine → process
                                       ──no───►  reject (401)
```

You must feed the **raw bytes** into your HMAC — a re-serialized object gives a different digest (Chapter 03).

---

## Implementation

Node's `crypto` module:

```javascript
const crypto = require("crypto");

// rawBody: a Buffer (from express.raw) — the EXACT bytes Shopify sent.
// hmacHeader: the value of the X-Shopify-Hmac-Sha256 header (base64).
function verifyShopifyWebhook(rawBody, hmacHeader) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET; // the WEBHOOK signing secret
  if (!secret || !hmacHeader) return false;

  // Recompute the HMAC over the raw bytes, as base64.
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody) // raw bytes, not a re-serialized object
    .digest("base64");

  // Compare in CONSTANT TIME (see below for why).
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  if (a.length !== b.length) return false; // timingSafeEqual requires equal lengths
  return crypto.timingSafeEqual(a, b);
}
```

In the handler:

```javascript
app.post("/webhooks/orders", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifyShopifyWebhook(req.body, req.get("X-Shopify-Hmac-Sha256"));
  if (!ok) return res.sendStatus(401); // reject anything that fails

  const order = JSON.parse(req.body.toString("utf8")); // trust only after verifying
  // ... react to the event ...
  res.sendStatus(200);
});
```

- **`createHmac("sha256", secret).update(rawBody).digest("base64")`** — Shopify uses SHA-256 + base64, so you match both.
- **The secret is the webhook signing secret**, from the environment.
- **`timingSafeEqual`**, not `===` — next.

---

## Why `timingSafeEqual` — constant-time comparison

`digest === hmacHeader` is *almost* fine, but opens a **timing attack**.

Normal comparison **short-circuits** — returns `false` at the first differing byte. So comparing against a secret that matches one more leading byte takes microscopically longer. That time leaks *how many leading bytes matched*, letting an attacker who measures response times reconstruct a valid signature byte by byte — without knowing the secret. Slow and fiddly, but a real, documented attack.

> **`crypto.timingSafeEqual(a, b)`** compares equal-length buffers in **constant time** — always examining every byte, so duration reveals nothing.

- It requires **equal-length** inputs (hence the length check; unequal → reject).
- Use it for **any** secret/signature comparison, not just here.

---

## The classic mistake: API secret vs. webhook secret

> **Mistake:** "I'll verify the webhook with my app's **API secret key**."
> **Reality:** Webhooks are signed with the **webhook signing secret** — a *different* value.

Which secret depends on how the webhook was created:

- **Created via the Admin API or app config** → signed with the app's **client/API secret**.
- **Created in the admin UI** (store notifications) → signed with a **separate webhook signing secret** shown in the admin.

If verification fails for *every* webhook though your code looks right, **you're using the wrong secret for how it was registered.** Match the secret to the creation method.

---

## Production Considerations

- **Reject on failure safely** — a failed HMAC → `401` and nothing else. Don't parse, don't process, don't log the raw body (it may contain PII).
- **Always verify against raw bytes** ([Chapter 03](03-express-raw-vs-json.md)).
- **Keep the secret in the environment**, never in code or git.
- **Use constant-time comparison everywhere** you compare a token/signature.
- **HMAC proves origin and integrity, not freshness** — a replayed valid webhook still passes (next chapter).

---

## Common Misconceptions

**❌ "My secret URL is enough."**
The URL is public, not authentication. Only the HMAC proves it's from Shopify.

**❌ "I can verify with the API secret key."**
Webhooks use the **webhook signing secret** (may differ from the API secret by creation method). Wrong secret → universal failure.

**❌ "`digest === header` is fine."**
`===` short-circuits and leaks timing. Use `crypto.timingSafeEqual`.

**❌ "I can hash the parsed body."**
Hash the **raw bytes** — a re-serialized body gives a different digest.

**❌ "A valid HMAC means the event is fresh."**
It proves authenticity and integrity, not novelty. A replayed webhook still verifies (next chapter).

---

## Frequently Asked Questions

**Q: What is HMAC?**
A keyed hash: `HMAC-SHA256(secret, message)` mixes the message with a shared secret. Only someone with the secret can produce a matching fingerprint, so a correct HMAC proves origin (authenticity) and that it wasn't altered (integrity).

**Q: Why SHA-256 and base64?**
That's what Shopify uses. Match the algorithm and encoding to match the digest.

**Q: Why `timingSafeEqual`?**
To prevent timing attacks — it always takes the same time, leaking nothing about how much matched.

**Q: Verification fails for every webhook — why?**
Either (1) hashing a re-serialized body instead of raw bytes, or (2) the wrong secret for how the webhook was created.

**Q: Is HMAC enough to fully trust the request?**
It proves origin and integrity, not recency — a replayed valid webhook still passes. Add replay protection (next chapter).

---

## Interview Questions

1. What is an HMAC, and what two properties does a valid one prove?
2. Why is a plain hash insufficient, and what does the secret add?
3. Which bytes must you HMAC, and why?
4. What is a timing attack, and how does `timingSafeEqual` prevent it?
5. What constraint does `timingSafeEqual` place on inputs?
6. Explain the API-secret-vs-webhook-secret mistake.
7. Does a valid HMAC guarantee freshness? What doesn't it protect against?

---

## Summary

- The **`X-Shopify-Hmac-Sha256`** header is an **HMAC-SHA256** over the body, keyed by a **shared secret** — recompute and compare.
- A valid HMAC proves **authenticity** and **integrity**; a URL alone proves neither.
- HMAC the **raw bytes** with **SHA-256 + base64** to match Shopify.
- Compare with **`crypto.timingSafeEqual`** (constant-time, equal-length), never `===`.
- Use the **webhook signing secret**, not the API secret.
- HMAC does **not** prove freshness — replays still pass (next chapter).

---

## What's Next

Your handler rejects forgeries. But a valid webhook an attacker *captured and re-sent* still passes. Closing that gap is the last piece.

→ **Next: [Replay attacks and webhook security](05-replay-attacks-and-security.md)** — why a genuine-but-repeated webhook is dangerous, and how to defend.
