# userErrors

Every mutation carried a `userErrors` block, and every chapter said "check it." Here's why. This is the GraphQL detail most likely to bite a REST developer: a mutation returns **`200 OK`**, yet nothing changed — because the failure was in `userErrors`, unread.

---

## Business Problem

You send `draftOrderCreate` with a variant ID that doesn't exist. In REST that's an HTTP error (`422`, `404`) your `res.ok` check catches.

In GraphQL, the same mistake often returns **HTTP `200 OK`**. The transport succeeded — but the *business operation* failed: no draft was created. The failure is in the response body, inside **`userErrors`**. Don't request or check it, and you get a `200`, a `null` draft order, and the false impression all is well.

> In GraphQL, HTTP `200` means "the query ran," **not** "the operation succeeded." `userErrors` answers the second question.

---

## Mental Model

Two error channels, both to be checked:

> 1. **Top-level `errors`** — the *query itself* was wrong: bad syntax, unknown field, type mismatch, auth. Protocol/validation failures.
> 2. **`userErrors`** (inside a mutation's result) — the query was valid but *business rules* rejected it: variant not found, duplicate customer, invalid discount.

```
   REST: everything → HTTP status codes (4xx/5xx)

   GraphQL splits it:
     bad query/auth/type   → top-level  "errors"
     valid query, business → response   "userErrors" (with HTTP 200)
     genuine success       → the result object populated, userErrors empty
```

Why split them? "You wrote a broken query" (a bug) and "the store's rules say no" (an expected outcome — out of stock, duplicate) are different problems needing different handling.

---

## Implementation

### Always request `userErrors`

If you don't ask, you can't see it:

```graphql
mutation CreateDraft($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder { id status }
    userErrors {
      field      # which input field caused it (path array)
      message    # human-readable reason
    }
  }
}
```

### Success vs. business failure — same HTTP status

**Success** — `draftOrder` populated, `userErrors` empty:

```json
{ "data": { "draftOrderCreate": {
  "draftOrder": { "id": "gid://shopify/DraftOrder/5001", "status": "OPEN" },
  "userErrors": []
} } }
```

**Business failure** — `draftOrder` is `null`, the reason is in `userErrors`, **still HTTP 200**:

```json
{ "data": { "draftOrderCreate": {
  "draftOrder": null,
  "userErrors": [
    { "field": ["input", "lineItems", "0", "variantId"], "message": "Variant not found" }
  ]
} } }
```

Same status code, opposite outcome. The only way to tell them apart is to read `userErrors`.

### Handling both channels

A correct call checks the transport, top-level `errors`, *and* `userErrors`:

```javascript
async function graphql(query, variables) {
  const res = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  // Channel 0: HTTP transport (rare for GraphQL, but check).
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const json = await res.json();

  // Channel 1: top-level errors — malformed query, bad field, auth, type.
  if (json.errors?.length) {
    throw new Error("Query errors: " + JSON.stringify(json.errors));
  }
  return json.data;
}

async function createDraft(input) {
  const data = await graphql(CREATE_DRAFT_MUTATION, { input });
  const result = data.draftOrderCreate;

  // Channel 2: business errors — the operation ran but was rejected.
  if (result.userErrors.length) {
    // Expected outcomes (out of stock, bad id): surface them, don't crash blindly.
    throw new Error("Business error: " + result.userErrors.map((e) => e.message).join("; "));
  }
  return result.draftOrder; // real success
}
```

The rule: **`res.ok` and empty `errors` mean the query ran; empty `userErrors` means the operation *worked*. Check all three.**

---

## Production Considerations

- **Never omit `userErrors`** — without it, failures are invisible (`200`, no exception).
- **Treat `userErrors` as expected outcomes, not crashes** — "out of stock," "email taken" are business results to surface to the user.
- **Check both channels distinctly** — top-level `errors` = your query is wrong (fix the bug); `userErrors` = valid but declined (inform the user).
- **Don't assume a populated result on `200`** — it can be `null` on a business failure. Guard for null.
- **Log `field`** — it points at the offending input path.

---

## Common Misconceptions

**❌ "HTTP 200 means my mutation succeeded."**
`200` means the query executed. Check `userErrors` and that the result isn't null.

**❌ "GraphQL reports errors via status codes like REST."**
Two in-body channels — `errors` and `userErrors` — often alongside a `200`.

**❌ "I don't need to request `userErrors`."**
If you don't select it, failures pass silently. Always include it.

**❌ "Any `userErrors` entry is a bug to crash on."**
Most are expected business outcomes to surface to the user.

---

## Frequently Asked Questions

**Q: Why did my mutation return `200` but nothing changed?**
A business rule rejected it; the reason is in `userErrors`, which you didn't request or check. Read `userErrors` and the (possibly `null`) result.

**Q: `errors` vs `userErrors`?**
`errors` = invalid query (how you asked); `userErrors` = valid query, business rejection (what you asked for).

**Q: Check both?**
Yes — plus `res.ok`. Three checks: HTTP status, `errors`, `userErrors`.

**Q: Are `userErrors` exceptional?**
No — normal outcomes for invalid business input. Show them to the user.

**Q: Which field failed?**
`userErrors[].field` gives the input path; `message` the reason. Log both.

---

## Interview Questions

1. What does an HTTP `200` on a mutation guarantee?
2. Describe the two error channels and what each reports.
3. What happens if you don't request `userErrors`?
4. REST vs GraphQL for a "variant not found" failure.
5. Crashes or outcomes — how to treat `userErrors`? Why?
6. List the checks a correct GraphQL client performs.

---

## Summary

- **HTTP `200` means the query ran, not that the operation succeeded.** Business failures come back **inside the response**.
- **Two channels**: top-level **`errors`** (invalid query/auth/type) and **`userErrors`** (business rejection, alongside a `200` with a `null` result).
- **Always request `userErrors`** and **check all three**: `res.ok`, `errors`, `userErrors`.
- Treat `userErrors` as **expected outcomes** to surface to users; log **`field`** to debug.

---

## What's Next

One piece of vocabulary remains. As queries grow, you repeat the same field lists.

→ **Next: [Fragments](07-fragments.md)** — define a reusable field set once and spread it, keeping GraphQL DRY.
