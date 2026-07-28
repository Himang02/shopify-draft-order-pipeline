# Variables

The last chapter's queries baked values right into the query text — an email, variant IDs, a customer ID. That's the GraphQL equivalent of building SQL by string concatenation: brittle, hard to reuse, and unsafe. **Variables** are the fix. This is a short, practical chapter.

---

## Business Problem

You'll create a draft order for many different customers and variants. Rewriting the whole query string each time — splicing in IDs by hand — is error-prone and, if any value comes from user input, a potential injection risk. You want to write the query **once** and pass **values** into it, the way you'd use parameterized statements instead of string-concatenated SQL.

---

## Mental Model

> A **variable** is a named, typed placeholder declared on the operation and supplied separately as JSON. The query text stays constant; only the `variables` object changes per call.

Three parts work together:

1. **Declare** the variables (with types) on the `query`/`mutation`.
2. **Use** them (prefixed with `$`) inside the body.
3. **Supply** their values as a separate `variables` JSON object in the request.

This mirrors prepared statements: the statement is fixed and reusable; the parameters travel alongside.

---

## Implementation

### A query with a variable

The customer lookup from [Chapter 02](02-queries-vs-mutations.md), now parameterized:

```graphql
query GetCustomer($search: String!) {
  customers(first: 1, query: $search) {
    edges { node { id firstName email } }
  }
}
```

Supplied with a separate variables object:

```json
{ "search": "email:alice@example.com" }
```

- **`query GetCustomer(...)`** — the operation now has a **name** (`GetCustomer`) and a **variable declaration**.
- **`$search: String!`** — a variable named `search` of type `String`. The **`!`** means *non-null* (required).
- **`query: $search`** — the variable used in place of a literal.

### A mutation with variables

`draftOrderCreate` with its input passed as a variable — the clean, reusable form:

```graphql
mutation CreateDraft($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder { id status totalPrice invoiceUrl }
    userErrors { field message }
  }
}
```

Variables:

```json
{
  "input": {
    "lineItems": [{ "variantId": "gid://shopify/ProductVariant/9002", "quantity": 2 }],
    "customerId": "gid://shopify/Customer/7001"
  }
}
```

Now the same mutation text serves every draft order — only the `input` JSON changes. Note the variable's type is **`DraftOrderInput!`**, a type Shopify defines; GraphQL validates your `variables` against it before executing.

### How it's sent over HTTP

The request body carries **both** the query and the variables as separate keys:

```
POST /admin/api/2024-10/graphql.json
X-Shopify-Access-Token: shpat_...
Content-Type: application/json

{
  "query": "mutation CreateDraft($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id status } userErrors { field message } } }",
  "variables": { "input": { "lineItems": [ ... ], "customerId": "gid://shopify/Customer/7001" } }
}
```

The two-key body — `{ query, variables }` — is the standard shape. Your GraphQL helper always sends both.

---

## Types and the `!`

Variables are **typed**, and GraphQL enforces the types before running anything:

- **Scalars:** `String`, `Int`, `Float`, `Boolean`, `ID`.
- **`!` = non-null (required).** `String!` must be provided; `String` may be omitted/null.
- **`[Type!]!`** = a required list of non-null items (e.g. a required, non-empty-ish list of line items).
- **Input objects:** complex inputs like `DraftOrderInput` bundle many fields; Shopify's schema defines exactly what's inside.

If you pass a value of the wrong type, or omit a required (`!`) one, the request fails **validation** (a top-level `errors` entry) *before* execution — a helpful, early failure.

---

## Production Considerations

- **Always use variables for dynamic values.** Never string-concatenate user input into query text — it's unreadable and unsafe. Variables keep the query static and pass data as structured JSON.
- **Name your operations.** `query GetCustomer`, `mutation CreateDraft`. Names aid logging, debugging, and are required when a request contains multiple operations.
- **Let types catch mistakes early.** A wrong type or missing `!` variable fails validation before execution — cheaper than a runtime surprise. Read Shopify's schema for exact input shapes.
- **Reuse one query, many variable sets.** The point of variables: define the operation once, call it repeatedly with different `variables`. Cache the query string; vary the data.
- **Variables don't replace `userErrors` checks.** Validation catches *type* problems; business rules (bad variant id) still surface in `userErrors` (Chapter 06).

---

## Common Misconceptions

**❌ "I'll just interpolate values into the query string."**
Reality: That's the brittle, unsafe path. Use declared, typed variables passed as a separate `variables` object.

**❌ "Variables go inside the query text."**
Reality: They're *declared* in the text (`$x: Type`) and *supplied* in a separate `variables` JSON key of the request body.

**❌ "The `!` is optional decoration."**
Reality: `!` means non-null/required and is type-checked. Omitting a required variable fails validation.

**❌ "Types are just documentation."**
Reality: GraphQL validates variables against their declared types before executing, rejecting mismatches up front.

---

## Frequently Asked Questions

**Q: Where do variable values actually go?**
In a separate `variables` key in the JSON request body, alongside `query`. The query text references them by `$name`; the values live in `variables`.

**Q: What does `String!` vs `String` mean?**
`String!` is a required, non-null string; `String` is optional/nullable. The `!` enforces presence.

**Q: What's `DraftOrderInput`?**
An **input object type** Shopify defines, bundling the fields a draft order create accepts (line items, customer, discount, etc.). You pass a matching JSON object as the variable; the schema validates it.

**Q: Why name operations like `CreateDraft`?**
Clarity in logs/errors, and it's required if a single request document contains more than one operation. It's good practice even with one.

**Q: Do variables protect against injection?**
They keep dynamic values out of the query text and pass them as typed JSON, which is the safe, structured approach — much better than concatenating strings.

---

## Interview Questions

1. What problem do GraphQL variables solve, and what REST/SQL practice are they analogous to?
2. What are the three parts of using a variable (declare, use, supply)?
3. In the HTTP request, where do the query and the variable values each go?
4. What does the `!` in `String!` or `DraftOrderInput!` mean?
5. When does a type mismatch get caught, and via which error channel?
6. Why name your operations?

---

## Summary

- **Variables** are named, typed placeholders that keep the query text **static** while values are supplied separately as a **`variables` JSON object** — like prepared statements.
- You **declare** them on the operation (`$input: DraftOrderInput!`), **use** them by `$name` in the body, and **supply** them in the request's `variables` key. The body is `{ query, variables }`.
- Types are **enforced**: `!` means required/non-null, and mismatches fail **validation** (top-level `errors`) before execution.
- Use variables for **all dynamic values** (never string-concatenate), **name** your operations, and remember variables don't replace **`userErrors`** checks.

---

## What's Next

Every example has used those `gid://shopify/...` IDs where REST used a bare integer. It's time to explain them.

→ **Next chapter: [Global IDs](04-global-ids.md)** — what `gid://shopify/ProductVariant/9002` is, why GraphQL uses it, and how it relates to the REST integer IDs.
