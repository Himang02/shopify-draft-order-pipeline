# HMAC, SHA-256, and `timingSafeEqual`

This is the security core of the section. You have the raw bytes ([Chapter 03](03-express-raw-vs-json.md)); now you verify that the webhook genuinely came from Shopify and wasn't tampered with. The tool is an **HMAC signature**. This chapter explains what that is from first principles, how to check it, and one subtle-but-real detail: why the comparison must be **constant-time**.

---

## Business Problem

Your webhook endpoint is a public URL ([Chapter 02](02-local-development-with-ngrok.md)). Anyone on the internet can `POST` to it. So an attacker could send:

```
POST /webhooks/orders
{ "id": 9999, "financial_status": "paid", "total_price": "1000000.00" }
```

If your handler trusts the body, you've just "processed" a fake million-rupee paid order. **A URL is not authentication.** You need proof that a given `POST` really originated from Shopify and that its body wasn't altered in transit. That proof is the HMAC signature Shopify puts in every webhook.

---

## Mental Model

Build it up from the pieces.

**Hash (SHA-256).** A hash function takes any bytes and produces a fixed-size "fingerprint." Change one byte of input and the fingerprint changes completely. But a plain hash alone proves nothing about *origin* — anyone can hash anything.

**Shared secret.** Shopify and your server both know one secret string: the **webhook signing secret**. Nobody else does. (Crucially — and this is the classic mix-up — this is *not* the API secret. More below.)

**HMAC = hash keyed by the secret.** An HMAC combines the message bytes *with* the shared secret to produce the fingerprint. Because it depends on the secret, **only someone who knows the secret can produce a valid HMAC for a given body.** So:

> A valid HMAC proves two things at once: **authenticity** (it came from someone who knows the secret — i.e. Shopify) and **integrity** (the body wasn't changed, or the fingerprint wouldn't match).

The verification idea:

> Shopify sends `HMAC-SHA256(secret, body)` in a header. Your server independently computes `HMAC-SHA256(secret, raw_body)` and checks the two are equal. Equal → genuine. Not equal → reject.

An attacker can copy your URL and craft a body, but **cannot** compute a matching signature without the secret. Their fake order fails the check.

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

Note the dependency on the previous chapter: you must feed the **raw bytes** into your HMAC. Feed a re-serialized object and you'll get a different digest — the exact failure Chapter 03 warned about.

---

## Implementation

Node's built-in `crypto` module does the work. The verification function:

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

Used in the handler from Chapter 03:

```javascript
app.post("/webhooks/orders", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifyShopifyWebhook(req.body, req.get("X-Shopify-Hmac-Sha256"));
  if (!ok) return res.sendStatus(401); // reject anything that fails

  const order = JSON.parse(req.body.toString("utf8")); // trust only after verifying
  // ... react to the event ...
  res.sendStatus(200);
});
```

Three details:

- **`createHmac("sha256", secret).update(rawBody).digest("base64")`** recomputes the signature. Shopify uses SHA-256 and base64, so you match both.
- **The secret is the webhook signing secret**, read from the environment — never hard-coded.
- **`timingSafeEqual`** does the comparison, not `===`. That's the next section.

---

## Why `timingSafeEqual` — the constant-time comparison

You might reach for `digest === hmacHeader`. It's *almost* fine — but it opens a subtle door called a **timing attack**.

Normal string/`Buffer` comparison is **short-circuiting**: it returns `false` at the *first* differing byte. So comparing `"aXXXXX"` to a secret starting `"b..."` returns faster than comparing `"bXXXXX"` (which matches one more byte before failing). The *time taken* leaks *how many leading bytes matched.*

An attacker who can measure response times can exploit this: try signatures byte by byte, keep the ones that take microscopically longer (one more byte matched), and reconstruct a valid signature without ever knowing the secret. It's slow and fiddly, but it's a real, documented class of attack.

> **`crypto.timingSafeEqual(a, b)`** compares two equal-length buffers in **constant time** — it always examines every byte, so the duration reveals nothing about *where* or *how much* they differ.

Two practical notes:

- It requires **equal-length** inputs (hence the length check before calling it; unequal lengths → reject).
- Use it for **any secret/signature comparison**, not just here. It's the right default whenever you compare security-sensitive values.

Analogy: a short-circuiting compare is a lock that clicks louder the more pins you get right — it helps a picker. A constant-time compare stays silent until the very end.

---

## The classic mistake: API secret vs. webhook secret

This repository preserves real mistakes, and this is one of the most common:

> **Mistake:** "I'll verify the webhook with my app's **API secret key**."
> **Reality:** Webhooks are signed with the **webhook signing secret**, which is a *different* value.

Which secret you use depends on how the webhook was created:

- **Webhooks you create via the Admin API or app config** are signed with the **app's client secret / API secret**.
- **Webhooks created in the Shopify admin UI** (store-defined notifications) are signed with a **separate webhook signing secret** shown in the admin's notifications settings.

If verification fails for *every* webhook even though your code looks right, **you're almost certainly using the wrong secret for how the webhook was registered.** Match the secret to the creation method. (Credential zoo recap: [Section 03, Ch. 01](../03-rest-api/01-authentication-and-access-tokens.md).)

---

## Production Considerations

- **Reject on failure, loudly-but-safely.** A failed HMAC → `401` and do nothing else. Don't parse, don't process, don't log the raw body verbatim (it may contain personal data).
- **Always verify against raw bytes.** The dependency on [Chapter 03](03-express-raw-vs-json.md) is absolute — re-serialized bodies won't match.
- **Keep the secret in the environment.** Like all secrets ([Section 03](../03-rest-api/01-authentication-and-access-tokens.md)), never in code or git.
- **Use constant-time comparison everywhere.** Not just webhooks — any time you compare a provided token/signature to an expected one.
- **HMAC proves origin and integrity, not freshness.** A valid-but-*replayed* old webhook still passes the HMAC. Preventing replays is the next chapter.

---

## Common Misconceptions

**❌ "My secret URL is enough security."**
Reality: The URL is public and not authentication. Only the HMAC proves the request is from Shopify.

**❌ "I can verify with the API secret key."**
Reality: Webhooks use the **webhook signing secret**, which may differ from the API secret depending on how the webhook was created. Wrong secret → universal failure.

**❌ "`digest === header` is fine."**
Reality: `===` short-circuits and leaks timing. Use `crypto.timingSafeEqual` for constant-time comparison.

**❌ "I can hash the parsed body."**
Reality: You must hash the **raw bytes**. A parsed-then-reserialized body produces a different digest.

**❌ "A valid HMAC means the event is fresh and should be processed."**
Reality: HMAC proves authenticity and integrity, not that it's new. An old webhook replayed still verifies — handle replays separately (next chapter).

---

## Frequently Asked Questions

**Q: What exactly is HMAC?**
A keyed hash: `HMAC-SHA256(secret, message)` mixes the message with a shared secret to produce a fingerprint. Only someone who knows the secret can produce a fingerprint that matches, so a correct HMAC proves the message came from that someone (authenticity) and wasn't altered (integrity).

**Q: Why SHA-256 and base64 specifically?**
Because that's what Shopify uses to compute the signature it sends. To get a matching digest you must use the same hash algorithm (SHA-256) and the same encoding (base64).

**Q: Why does `timingSafeEqual` exist?**
To prevent timing attacks. Ordinary comparisons return faster the earlier they find a mismatch, leaking how much matched. `timingSafeEqual` always takes the same time regardless, so nothing leaks.

**Q: My verification fails for every single webhook — what's wrong?**
Two usual culprits: (1) you're hashing a parsed/re-serialized body instead of the raw bytes (Chapter 03), or (2) you're using the wrong secret for how the webhook was created (API secret vs. webhook signing secret).

**Q: Is verifying the HMAC enough to fully trust the request?**
It proves origin and integrity. It does *not* prove the message is recent — a replayed old-but-valid webhook still passes. Add replay protection (next chapter).

---

## Interview Questions

1. What is an HMAC, and what two properties does a valid one prove?
2. Why is a plain hash insufficient, and what does the shared secret add?
3. Which bytes must you compute the HMAC over, and why (tie it to the previous chapter)?
4. What is a timing attack, and how does `timingSafeEqual` prevent it?
5. What constraint does `timingSafeEqual` place on its inputs?
6. Explain the API-secret-vs-webhook-secret mistake and how to diagnose it.
7. Does a valid HMAC guarantee the webhook is fresh? What doesn't it protect against?

---

## Summary

- A webhook's **`X-Shopify-Hmac-Sha256`** header is an **HMAC-SHA256 signature** over the body, keyed by a **shared secret**. Recompute it on your side and compare.
- A valid HMAC proves **authenticity** (from someone who knows the secret — Shopify) and **integrity** (body unaltered). A URL alone proves neither.
- Compute the HMAC over the **raw bytes** ([Chapter 03](03-express-raw-vs-json.md)); use **SHA-256 + base64** to match Shopify.
- Compare with **`crypto.timingSafeEqual`** (constant-time, equal-length) — never `===` — to avoid **timing attacks**.
- Use the **webhook signing secret**, not the API secret; mismatching them is the classic cause of universal verification failure.
- HMAC does **not** prove freshness — a replayed valid webhook still passes, which the next chapter addresses.

---

## What's Next

Your handler now rejects forgeries. But a valid webhook that an attacker *captured and re-sent* still passes the HMAC. Closing that gap is the last piece of webhook security.

→ **Next chapter: [Replay attacks and webhook security](05-replay-attacks-and-security.md)** — why a genuine-but-repeated webhook is dangerous, and how to defend against it.
