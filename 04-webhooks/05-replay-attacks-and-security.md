# Replay Attacks and Webhook Security

The [HMAC chapter](04-hmac-sha256-timingsafeequal.md) closed one hole: forgeries. But it left a subtle one open. A signature proves a webhook is *genuine* and *unaltered* — it says nothing about whether it's *new*. An attacker (or a glitch) can take a real, correctly-signed webhook and send it **again**. This chapter is about that gap and how to close it, then gathers the section's security rules into one checklist.

---

## Business Problem

Suppose an attacker captures one genuine `orders/paid` webhook for Alice's ₹1,155 order — maybe from logs, maybe from a misconfigured proxy. The HMAC is valid (it's a real Shopify signature). Now they `POST` it to your endpoint **ten more times**.

Each copy **passes HMAC verification** — it's a real, unmodified Shopify message. If your handler naively "processes a paid order" every time it sees one, you might:

- credit Alice's account ten times,
- ship ten times,
- fire ten downstream notifications.

That's a **replay attack**: re-sending a valid message to cause an action to happen more than once. HMAC can't stop it, because the replayed bytes are authentically Shopify's. Even without an attacker, **Shopify itself retries** deliveries ([Chapter 01](01-what-are-webhooks.md)) — so duplicates happen in normal operation too.

> A valid signature proves *who* and *what*, not *when* or *how many times*.

---

## Mental Model

The defenses layer on top of HMAC, not instead of it:

> 1. **Idempotency** — make processing the same event twice have the *same effect* as processing it once. This defends against both retries and replays.
> 2. **Freshness** — reject webhooks that are too old, using the timestamp Shopify includes, so a captured message can't be replayed much later.

Idempotency is the workhorse (it also handles Shopify's legitimate retries); freshness is a useful extra bound. Together with HMAC:

```
   HMAC        → is it genuine and unaltered?      (authenticity + integrity)
   Freshness   → is it recent?                     (bounds replay window)
   Idempotency → have I already handled this one?  (safe to see it again)
```

Analogy: HMAC checks the cheque is genuine; the date check rejects a stale cheque; idempotency is your ledger noting "already cashed this cheque number" so you never cash it twice.

---

## Defense 1: Idempotency (the essential one)

Every webhook identifies its underlying event. Use a **stable identifier** — the resource id (e.g. the order `id`), and/or Shopify's delivery id header (`X-Shopify-Webhook-Id`) — as a **dedup key**. Record which keys you've processed; skip anything you've seen.

```javascript
// A tiny illustrative store; use a real DB (with a UNIQUE constraint) in production.
const processed = new Set();

function handleOrderWebhook(order, webhookId) {
  // Prefer a key that identifies THIS event. The delivery id is per-delivery;
  // for business idempotency, dedupe on what makes the effect unique, e.g. order id
  // plus topic, so retries of the same event collapse to one.
  const key = `orders/paid:${order.id}`;

  if (processed.has(key)) {
    console.log(`Already handled ${key} — skipping (retry/replay).`);
    return; // same effect as before: nothing extra happens
  }

  processed.add(key);
  // ... do the real work exactly once: credit, ship, notify ...
  console.log(`Processed ${key} for the first time.`);
}
```

The important properties:

- **Persist the dedup record**, ideally with a database **UNIQUE constraint**, so even concurrent duplicates can't both win the insert. An in-memory `Set` is fine for a demo but lost on restart.
- **Choose the key to match the effect.** If "paid" should act once per order, key on the order (+ topic). Keying purely on the per-delivery id would let a *maliciously re-sent* different delivery of the same event slip through — think about what "once" means for your action.
- Idempotency also silently absorbs **Shopify's normal retries**, which is why it's non-optional regardless of attackers.

---

## Defense 2: Freshness (bounding the replay window)

Shopify includes a timestamp header, `X-Shopify-Triggered-At` (and webhooks carry timing info). Reject deliveries whose timestamp is far from *now*:

```javascript
function isFresh(triggeredAt, toleranceMs = 5 * 60 * 1000) {
  const sent = new Date(triggeredAt).getTime();
  if (Number.isNaN(sent)) return false;
  return Math.abs(Date.now() - sent) <= toleranceMs; // within ±5 minutes
}
```

A captured webhook replayed hours later fails the freshness check. Notes:

- Keep the tolerance generous enough for legitimate **retry delays** and clock skew (minutes, not seconds) — too tight and you'll drop valid retries.
- Freshness **narrows** the replay window; it doesn't eliminate replays inside the window. That's why idempotency is still required. Freshness is defense-in-depth, not a substitute.

---

## The full security checklist

Everything from this section, in the order your handler should apply it:

```
   1. Read the RAW body            (express.raw — chapter 03)
   2. Verify the HMAC signature    (constant-time — chapter 04)   ── reject if bad (401)
   3. (Optional) Check freshness   (timestamp within tolerance)   ── reject if stale
   4. Parse the JSON               (only now is it safe)
   5. Dedup on a stable key        (idempotency)                  ── skip if already handled
   6. Acknowledge FAST (200), work ASYNC
   7. Never trust / never skip on failure; log safely (no raw PII)
```

Miss step 1 and step 2 fails. Skip step 2 and you accept forgeries. Skip step 5 and retries/replays double-process. Each layer guards a distinct threat — they don't replace each other.

---

## Production Considerations

- **Idempotency is mandatory, not optional.** Even with zero attackers, Shopify's retries guarantee duplicates. A non-idempotent handler is buggy by construction.
- **Use a durable, atomic dedup store.** A DB row with a UNIQUE constraint on the dedup key makes "process once" safe under concurrency and across restarts.
- **Acknowledge before heavy work.** Return `200` fast, enqueue the job. A slow handler causes timeouts → more retries → more duplicates you must dedup.
- **Fail closed.** On any verification/freshness failure, reject and do nothing. Never "process anyway just in case."
- **Keep a reconciliation backstop.** Because deliveries can also be *missed* ([Chapter 01](01-what-are-webhooks.md)), periodically reconcile against the API for critical data. Webhooks are the fast path, not the only path.
- **Protect data in logs.** Webhook bodies contain personal data (Section 02, Ch. 03). Log identifiers, not raw payloads, and mind privacy obligations ([Section 10](../10-production/)).

---

## Common Misconceptions

**❌ "A valid HMAC means I can safely process the webhook."**
Reality: HMAC proves authenticity and integrity, not novelty. A genuine webhook replayed still verifies. You also need idempotency (and ideally freshness).

**❌ "Only attackers cause duplicate webhooks."**
Reality: Shopify's own retry mechanism produces duplicates in normal operation. Idempotency is required regardless.

**❌ "Freshness checking replaces idempotency."**
Reality: Freshness only bounds *how long* a replay window stays open; duplicates within the window (including legit retries) still occur. Idempotency handles those.

**❌ "An in-memory set is enough for dedup."**
Reality: It's lost on restart and unsafe across instances. Use a durable store with a uniqueness guarantee.

**❌ "If verification fails, I should process it anyway to be safe."**
Reality: Fail closed. A failed check means *don't* process. Processing unverified input is the whole vulnerability.

---

## Frequently Asked Questions

**Q: What is a replay attack?**
Re-sending a genuine, correctly-signed message to make an action happen more than once. Because the bytes are authentic, HMAC verification passes; the defense is to detect that you've already handled that event (idempotency) and/or that it's too old (freshness).

**Q: If HMAC can't stop replays, what's it for?**
Authenticity and integrity — proving the message is really from Shopify and wasn't altered. That's necessary but not sufficient; replays need their own defense.

**Q: How do I make a handler idempotent?**
Derive a stable key for the event (e.g. order id + topic), record processed keys durably, and skip anything already recorded — so processing twice has the same effect as once.

**Q: What's a good freshness tolerance?**
A few minutes. Wide enough to allow legitimate retry delays and clock skew, narrow enough to limit the replay window. Don't make it seconds, or you'll reject valid retries.

**Q: Do I still need to poll if I have webhooks?**
Not routinely — but keep an occasional **reconciliation** job as a backstop, because webhooks can be missed. Webhooks are the primary, near-real-time channel; reconciliation catches the gaps.

---

## Interview Questions

1. What is a replay attack, and why doesn't HMAC prevent it?
2. Name the two defenses that layer on top of HMAC and what each addresses.
3. Why is idempotency required even if you assume no attackers?
4. How do you choose a good dedup key, and where should you store it?
5. What does a freshness check accomplish, and why doesn't it replace idempotency?
6. List the steps of a correct webhook handler in order.
7. Why must a handler "fail closed," and why acknowledge before doing heavy work?

---

## Summary

- HMAC proves a webhook is **genuine and unaltered**, but **not new** — so a captured, correctly-signed webhook can be **replayed**, and Shopify's **retries** create duplicates even without attackers.
- Defend with **idempotency** (dedup on a stable key so processing twice = processing once) as the essential layer, plus **freshness** (reject webhooks outside a few-minutes tolerance) as defense-in-depth.
- A correct handler applies, in order: **raw body → verify HMAC → (freshness) → parse → dedup → ack fast → work async**, always **failing closed**.
- Use a **durable, atomic dedup store**, keep a **reconciliation backstop** for missed deliveries, and **protect personal data** in logs.

---

## What's Next

**That completes webhook security** — your server can now receive Shopify's events, prove they're genuine, and process them exactly once. Combined with Section 03, you can drive the full pipeline *and* react to it in real time.

So far every API call has been REST. Shopify's other API surface takes a different shape — one endpoint, and *you* describe the data you want.

→ **Next: [Section 05 — GraphQL](../05-graphql/).** Why it exists, and how everything you did in REST looks when you ask for exactly the fields you need.
