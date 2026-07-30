# Variables

The last chapter baked values into the query text — an email, IDs. That's the GraphQL equivalent of building SQL by string concatenation: brittle and unsafe. **Variables** are the fix.

---

## Business Problem

You'll create draft orders for many customers and variants. Rewriting the query string each time — splicing IDs by hand — is error-prone and, if a value comes from user input, an injection risk. You want to write the query **once** and pass **values** in, like parameterized SQL.

---

## Mental Model

> A **variable** is a named, typed placeholder declared on the operation and supplied separately as JSON. The query text stays constant; only the `variables` object changes per call.

Three parts:

1. **Declare** variables (with types) on the `query`/`mutation`.
2. **Use** them (`$`-prefixed) in the body.
3. **Supply** their values as a separate `variables` JSON object.

Like prepared statements: fixed statement, parameters alongside.

---

## Implementation

### A query with a variable

The customer lookup, parameterized:

```graphql
query GetCustomer($search: String!) {
  customers(first: 1, query: $search) {
    edges { node { id firstName email } }
  }
}
```

Variables:

```json
{ "search": "email:alice@example.com" }
```

- **`query GetCustomer(...)`** — the operation has a **name** and a **variable declaration**.
- **`$search: String!`** — a `String` variable; **`!`** means non-null (required).
- **`query: $search`** — used in place of a literal.

### A mutation with variables

`draftOrderCreate` with its input as a variable:

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

The same mutation text serves every draft — only the `input` JSON changes. The type **`DraftOrderInput!`** is defined by Shopify; GraphQL validates your variables against it before executing.

### Over HTTP

The body carries **both** query and variables:

```
POST /admin/api/2024-10/graphql.json
X-Shopify-Access-Token: shpat_...
Content-Type: application/json

{
  "query": "mutation CreateDraft($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id status } userErrors { field message } } }",
  "variables": { "input": { "lineItems": [ ... ], "customerId": "gid://shopify/Customer/7001" } }
}
```

The `{ query, variables }` body is the standard shape.

---

## Types and the `!`

Variables are **typed**, enforced before execution:

- **Scalars:** `String`, `Int`, `Float`, `Boolean`, `ID`.
- **`!` = non-null (required).** `String!` must be provided; `String` may be null.
- **`[Type!]!`** = a required list of non-null items.
- **Input objects** like `DraftOrderInput` bundle many fields; Shopify's schema defines them.

Wrong type or a missing `!` variable fails **validation** (a top-level `errors` entry) *before* execution.

---

## Production Considerations

- **Always use variables for dynamic values** — never string-concatenate user input.
- **Name your operations** (`GetCustomer`, `CreateDraft`) — aids logging and is required with multiple operations in one document.
- **Let types catch mistakes early** — a mismatch fails validation before execution.
- **Reuse one query, many variable sets** — cache the query string, vary the data.
- **Variables don't replace `userErrors`** — validation catches *type* problems; business rules still surface in `userErrors` (Chapter 06).

---

## Common Misconceptions

**❌ "I'll interpolate values into the query string."**
Brittle and unsafe. Use declared, typed variables.

**❌ "Variables go inside the query text."**
Declared in the text (`$x: Type`), supplied in a separate `variables` JSON key.

**❌ "The `!` is optional decoration."**
It means non-null/required and is type-checked.

**❌ "Types are just documentation."**
GraphQL validates against them before executing.

---

## Frequently Asked Questions

**Q: Where do the values go?**
In a separate `variables` key alongside `query`. The text references `$name`; the values live in `variables`.

**Q: `String!` vs `String`?**
`String!` is required/non-null; `String` is optional.

**Q: What's `DraftOrderInput`?**
An input object type Shopify defines, bundling the fields a draft-order create accepts. Pass a matching JSON object; the schema validates it.

**Q: Why name operations?**
Clarity in logs/errors, and required with multiple operations in one document.

**Q: Do variables protect against injection?**
Yes — they keep dynamic values out of the query text as typed JSON.

---

## Interview Questions

1. What do variables solve, and what SQL practice are they like?
2. The three parts of using a variable?
3. Where do the query and variable values each go in the request?
4. What does `!` mean?
5. When is a type mismatch caught, and via which channel?
6. Why name operations?

---

## Summary

- **Variables** are named, typed placeholders keeping the query **static** while values come in a separate **`variables`** object — like prepared statements.
- **Declare** on the operation, **use** by `$name`, **supply** in the `variables` key. Body is `{ query, variables }`.
- Types are **enforced**: `!` means required, mismatches fail **validation** before execution.
- Use variables for **all dynamic values**, **name** operations, and remember they don't replace **`userErrors`** checks.

---

## What's Next

Every example uses `gid://shopify/...` IDs where REST used a bare integer. Time to explain them.

→ **Next: [Global IDs](04-global-ids.md)** — what `gid://shopify/ProductVariant/9002` is, and how it relates to REST integers.
