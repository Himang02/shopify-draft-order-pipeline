# userErrors

Every mutation in this section carried a `userErrors` block, and every chapter said "check it." Now we explain *why* it exists and what goes wrong if you ignore it. This is the GraphQL detail most likely to bite a REST developer: a mutation returns **`200 OK`**, yet nothing changed — because the real failure was sitting in `userErrors`, unread.

---

## Business Problem

You send `draftOrderCreate` with a variant ID that doesn't exist. In REST, a bad request came back as an **HTTP error** — `422`, `404` — impossible to miss; your `res.ok` check ([Section 03](../03-rest-api/01-authentication-and-access-tokens.md)) caught it.

In GraphQL, the same mistake often returns **HTTP `200 OK`**. The transport succeeded — Shopify received a valid query and responded. But the *business operation* failed: no draft order was created. Where's the failure reported? In the response body, inside **`userErrors`**. If you didn't request that field, or didn't check it, you get a `200`, a `null` draft order, and the silent impression that all is well.

> In GraphQL, HTTP `200` means "the query ran," **not** "the operation succeeded." Those are different questions, and `userErrors` answers the second.

---

## Mental Model

GraphQL separates failures into **two channels**, and you must check both:

> 1. **Top-level `errors`** — the *query itself* was wrong: malformed syntax, a field that doesn't exist, a type mismatch, an auth problem. These are protocol/validation failures.
> 2. **`userErrors`** (inside a mutation's result) — the query was valid, but the *business rules* rejected it: a variant not found, a customer already taken, an invalid discount. The operation ran and declined.

Mapping to what REST folded together:

```
   REST: everything → HTTP status codes (4xx/5xx)

   GraphQL splits it:
     bad query/auth/type   → top-level  "errors"   (often with a non-2xx too)
     valid query, business → response   "userErrors" (with HTTP 200)
     genuine success       → the result object populated, userErrors empty
```

Why split them? Because "you wrote a broken query" and "the store's rules say no" are genuinely different problems needing different handling — one is a bug in your code, the other is an expected business outcome (out of stock, duplicate email) you want to show the user. GraphQL makes the distinction explicit instead of overloading HTTP codes.

---

## Implementation

### Always request `userErrors`

If you don't ask for it, you can't see it. Every mutation should select it:

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

**Business failure** — `draftOrder` is `null`, the reason is in `userErrors`, and it's **still HTTP 200**:

```json
{ "data": { "draftOrderCreate": {
  "draftOrder": null,
  "userErrors": [
    { "field": ["input", "lineItems", "0", "variantId"], "message": "Variant not found" }
  ]
} } }
```

Same status code, opposite outcome. The **only** way to tell them apart is to read `userErrors`.

### Handling both channels in code

A correct GraphQL call checks the transport, the top-level `errors`, *and* `userErrors`:

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

The rule in one line: **`res.ok` and empty `errors` mean the query ran; empty `userErrors` means the operation *worked*. Check all three.**

---

## Production Considerations

- **Never omit `userErrors` from a mutation.** Without it, failures are invisible — the worst kind of bug, because everything *looks* fine (`200`, no exception).
- **Treat `userErrors` as expected outcomes, not crashes.** "Out of stock," "email taken," "invalid discount" are normal business results to show the user — handle them gracefully, don't just throw a 500.
- **Check both channels distinctly.** Top-level `errors` usually means *your code/query is wrong* (fix the bug); `userErrors` usually means *the request was valid but declined* (inform the user). They warrant different responses.
- **Don't assume a populated result on `200`.** The result object can be `null` on a business failure while HTTP is `200`. Guard for null.
- **Log `field` for debugging.** `userErrors[].field` points at the offending input path — invaluable when a complex `input` is rejected.

---

## Common Misconceptions

**❌ "HTTP 200 means my mutation succeeded."**
Reality: `200` means the query executed. The operation may still have failed — check `userErrors` (and that the result object isn't null).

**❌ "GraphQL reports errors the way REST does, via status codes."**
Reality: GraphQL uses two in-body channels — top-level `errors` and `userErrors` — often alongside a `200`. Status codes alone won't tell you.

**❌ "I don't need to request `userErrors`."**
Reality: If you don't select it, you can't see it. Failures then pass silently. Always include it.

**❌ "Any `userErrors` entry is a server bug to crash on."**
Reality: Most are expected business outcomes (out of stock, duplicate) meant to be surfaced to the user. Handle, don't just explode.

---

## Frequently Asked Questions

**Q: Why did my mutation return `200` but nothing changed?**
Because a business rule rejected it and the reason is in `userErrors`, which you didn't request or check. The transport succeeded (`200`); the operation didn't. Read `userErrors` and the (possibly `null`) result object.

**Q: What's the difference between top-level `errors` and `userErrors`?**
Top-level `errors` = the query was invalid (syntax, unknown field, type, auth) — a problem with *how you asked*. `userErrors` = the query was valid but the business rules said no (bad id, duplicate) — a problem with *what you asked for*.

**Q: Do I check both?**
Yes. And also `res.ok` for the rare transport failure. Three checks: HTTP status, `errors`, `userErrors`.

**Q: Are `userErrors` exceptional?**
No — they're normal, expected outcomes for invalid business input. Show them to the user; don't treat every one as a crash.

**Q: How do I know which field failed?**
`userErrors[].field` gives the input path (e.g. `["input","lineItems","0","variantId"]`), and `message` gives the reason. Log both.

---

## Interview Questions

1. In GraphQL, what does an HTTP `200` on a mutation actually guarantee?
2. Describe the two error channels and what kind of failure each reports.
3. What happens if you don't request `userErrors` on a mutation?
4. Give a REST example and its GraphQL equivalent for a "variant not found" failure.
5. Should `userErrors` entries be treated as crashes or as outcomes? Why?
6. List the checks a correct GraphQL client performs on a mutation response.

---

## Summary

- In GraphQL, **HTTP `200` means the query ran, not that the operation succeeded.** Business failures come back **inside the response**.
- There are **two error channels**: top-level **`errors`** (invalid query/auth/type — a problem with *how* you asked) and **`userErrors`** (valid query, business-rule rejection — a problem with *what* you asked), the latter typically alongside a `200` with a `null` result.
- **Always request `userErrors`** on mutations and **check all three** signals: `res.ok`, top-level `errors`, and `userErrors`.
- Treat `userErrors` as **expected outcomes** (out of stock, duplicate email) to surface to users — and log **`field`** to debug rejected inputs.

---

## What's Next

One piece of vocabulary remains. As queries grow, you repeat the same field lists across them. GraphQL has a tool to name and reuse those.

→ **Next chapter: [Fragments](07-fragments.md)** — define a reusable set of fields once and spread it across queries and mutations, keeping your GraphQL DRY.
