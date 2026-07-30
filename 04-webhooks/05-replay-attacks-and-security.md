# Replay Attacks and Webhook Security

The [HMAC chapter](04-hmac-sha256-timingsafeequal.md) closed forgeries, but left a subtle hole. A signature proves a webhook is *genuine* and *unaltered* — not that it's *new*. An attacker (or a glitch) can take a real, correctly-signed webhook and send it **again**. This chapter closes that gap, then gathers the section's rules into one checklist.

---

## Business Problem

An attacker captures one genuine `orders/paid` webhook (from logs, a misconfigured proxy) and `POST`s it to your endpoint **ten more times**.

Each copy **passes HMAC verification** — it's a real, unmodified Shopify message. A naive handler might credit Alice ten times, ship ten times, fire ten notifications.

That's a **replay attack**: re-sending a valid message to make an action happen repeatedly. HMAC can't stop it — the bytes are authentically Shopify's. And even without an attacker, **Shopify retries** deliveries, so duplicates happen normally.

> A valid signature proves *who* and *what*, not *when* or *how many times*.

---

## Mental Model

Two defenses layer on top of HMAC:

> 1. **Idempotency** — processing the same event twice has the *same effect* as once. Defends against both retries and replays.
> 2. **Freshness** — reject webhooks that are too old, so a captured message can't be replayed much later.

Idempotency is the workhorse (it also absorbs Shopify's legit retries); freshness is an extra bound.

```
   HMAC        → is it genuine and unaltered?      (authenticity + integrity)
   Freshness   → is it recent?                     (bounds replay window)
   Idempotency → have I already handled this one?  (safe to see it again)
```

Analogy: HMAC checks the cheque is genuine; the date check rejects a stale cheque; idempotency is your ledger noting "already cashed this cheque number."

---

## Defense 1: Idempotency (essential)

Use a **stable identifier** — the resource id (order `id`) and/or the delivery id header (`X-Shopify-Webhook-Id`) — as a **dedup key**. Record processed keys; skip repeats.

```javascript
// A tiny illustrative store; use a real DB (with a UNIQUE constraint) in production.
const processed = new Set();

function handleOrderWebhook(order, webhookId) {
  // Dedupe on what makes the effect unique, e.g. order id + topic, so retries
  // of the same event collapse to one.
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

- **Persist the dedup record**, ideally with a DB **UNIQUE constraint**, so concurrent duplicates can't both win. An in-memory `Set` is demo-only (lost on restart).
- **Match the key to the effect** — if "paid" should act once per order, key on order + topic.
- Idempotency also absorbs **Shopify's normal retries** — non-optional regardless of attackers.

---

## Defense 2: Freshness (bounding the window)

Shopify includes a timestamp (`X-Shopify-Triggered-At`). Reject deliveries far from *now*:

```javascript
function isFresh(triggeredAt, toleranceMs = 5 * 60 * 1000) {
  const sent = new Date(triggeredAt).getTime();
  if (Number.isNaN(sent)) return false;
  return Math.abs(Date.now() - sent) <= toleranceMs; // within ±5 minutes
}
```

A webhook replayed hours later fails. Notes:

- Keep the tolerance generous (minutes, not seconds) for legitimate retry delays and clock skew.
- Freshness **narrows** the replay window; it doesn't eliminate replays inside it. Idempotency is still required — freshness is defense-in-depth.

---

## The full security checklist

In the order your handler applies it:

```
   1. Read the RAW body            (express.raw — chapter 03)
   2. Verify the HMAC signature    (constant-time — chapter 04)   ── reject if bad (401)
   3. (Optional) Check freshness   (timestamp within tolerance)   ── reject if stale
   4. Parse the JSON               (only now is it safe)
   5. Dedup on a stable key        (idempotency)                  ── skip if already handled
   6. Acknowledge FAST (200), work ASYNC
   7. Never trust / never skip on failure; log safely (no raw PII)
```

Miss step 1 and step 2 fails. Skip step 2 and you accept forgeries. Skip step 5 and retries/replays double-process. Each layer guards a distinct threat.

---

## Production Considerations

- **Idempotency is mandatory** — Shopify's retries guarantee duplicates even with zero attackers.
- **Use a durable, atomic dedup store** — a DB row with a UNIQUE constraint on the key.
- **Acknowledge before heavy work** — `200` fast, then enqueue; a slow handler causes timeouts → retries → more duplicates.
- **Fail closed** — on any verification/freshness failure, reject and do nothing.
- **Keep a reconciliation backstop** — deliveries can be *missed*; reconcile against the API for critical data.
- **Protect data in logs** — log identifiers, not raw payloads (PII).

---

## Common Misconceptions

**❌ "A valid HMAC means I can safely process it."**
HMAC proves authenticity and integrity, not novelty. A replayed webhook still verifies. You need idempotency (and ideally freshness).

**❌ "Only attackers cause duplicates."**
Shopify's retries produce them in normal operation.

**❌ "Freshness replaces idempotency."**
Freshness only bounds the window; duplicates within it (including retries) still occur.

**❌ "An in-memory set is enough for dedup."**
Lost on restart, unsafe across instances. Use a durable store with a uniqueness guarantee.

**❌ "If verification fails, process anyway to be safe."**
Fail closed. Processing unverified input is the whole vulnerability.

---

## Frequently Asked Questions

**Q: What is a replay attack?**
Re-sending a genuine, signed message to make an action happen repeatedly. It passes HMAC; defend with idempotency and/or freshness.

**Q: If HMAC can't stop replays, what's it for?**
Authenticity and integrity — necessary but not sufficient. Replays need their own defense.

**Q: How do I make a handler idempotent?**
A stable key per event (order id + topic), recorded durably; skip anything already recorded.

**Q: Good freshness tolerance?**
A few minutes — wide enough for retry delays and clock skew, narrow enough to limit the window.

**Q: Do I still need to poll?**
Not routinely — but keep an occasional **reconciliation** job, since webhooks can be missed.

---

## Interview Questions

1. What is a replay attack, and why doesn't HMAC prevent it?
2. Name the two defenses on top of HMAC and what each addresses.
3. Why is idempotency required even with no attackers?
4. How do you choose a dedup key, and where do you store it?
5. What does freshness accomplish, and why doesn't it replace idempotency?
6. List the steps of a correct handler in order.
7. Why "fail closed," and why acknowledge before heavy work?

---

## Summary

- HMAC proves a webhook is **genuine and unaltered**, but **not new** — so it can be **replayed**, and Shopify's **retries** create duplicates anyway.
- Defend with **idempotency** (dedup on a stable key) as the essential layer, plus **freshness** as defense-in-depth.
- A correct handler: **raw body → verify HMAC → (freshness) → parse → dedup → ack fast → work async**, always **failing closed**.
- Use a **durable, atomic dedup store**, keep a **reconciliation backstop**, and **protect PII** in logs.

---

## What's Next

**That completes webhook security** — receive events, prove them genuine, process them exactly once. With Section 03, you can drive the pipeline *and* react to it in real time.

Every API call so far has been REST. Shopify's other surface takes a different shape — one endpoint, and *you* describe the data.

→ **Next: [Section 05 — GraphQL](../05-graphql/).** Why it exists, and how REST looks when you ask for exactly the fields you need.
