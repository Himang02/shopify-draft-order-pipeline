# Authentication & the Admin API Access Token

Now we make real calls — and every call first needs **proof you're allowed to make it**. This chapter: what an Admin API access token is, where it comes from, and how to attach it. Get it right and every other call in Section 03 is "same auth, different endpoint."

---

## Business Problem

Himang's store holds real customer data and orders. Shopify can't let anyone who knows the store's URL read Alice's address. So before your server touches the Admin API, it must answer:

> "Who are you, and are you allowed to do this to *this* store?"

That's **authentication** (who you are) and **authorization** (what you may do). Both are carried by one credential: an **access token**.

---

## Mental Model

> An **Admin API access token** is a secret string meaning "the bearer may act on *this store*, within *these permissions*."

Two anchors from earlier:

- **Per-store.** Stores are isolated tenants ([Section 01, Ch. 03](../01-introduction/03-merchants-stores-and-the-admin.md)); a token belongs to exactly one.
- **Permission-scoped.** A token is granted specific **scopes** (`read_products`, `write_draft_orders`) — like staff permissions. It can do only what its scopes allow.

Analogy: a **key card** for one building (one store) that opens only certain doors (its scopes). It's a secret.

---

## Where the token comes from: custom apps

You get a token by creating an **app** on the store. For a single store you control — Himang's case — that's a **custom app**. Set up once in the admin:

```
Shopify Admin → Settings → Apps and sales channels
             → Develop apps → Create an app
             → Configure Admin API scopes  (read_products, write_draft_orders, ...)
             → Install app
             → Reveal the Admin API access token   ←  this is your secret
```

The result:

```
shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- The `shpat_` prefix marks a Shopify custom-app access token.
- You see the full token **once** — copy it into a secret store immediately. Lose it and you regenerate (invalidating the old one).

> **Custom app vs. public app:** a custom app is built for one store and gives a token directly — perfect here. A public app is distributed to many stores and gets tokens via **OAuth**. Section 03 uses custom apps; OAuth is [Section 09](../09-authentication/). Same token at the end, different way of getting it.

---

## The many "secrets" — and which one this is

| Credential | What it's for | Used here? |
|-----------|---------------|----------------------|
| **Admin API access token** (`shpat_…`) | Authorize Admin API calls. | ✅ The one you need |
| **API key** & **API secret key** | Identify the *app*; used in OAuth for public apps. | [Section 09](../09-authentication/) |
| **Webhook signing secret** | Verify incoming webhooks are from Shopify. | [Section 04](../04-webhooks/) |
| **Storefront API access token** | Public, browser-safe token for the Storefront API. | Not this flow |

The classic mix-up — using the **API secret** to verify webhooks — is corrected in [Section 04](../04-webhooks/). For now: **Admin API calls use the `shpat_` access token, nothing else.**

---

## Architecture

Every request carries the token in a header; Shopify checks it first:

```
   ┌─────────────┐   HTTPS request with header:              ┌───────────┐
   │ Your Server │   X-Shopify-Access-Token: shpat_xxx  ───► │  Shopify   │
   └─────────────┘                                            └───────────┘
                                                                    │
                                          1. Which store? → the myshopify.com domain in the URL
                                          2. Valid token for that store?
                                          3. Does the token's scope allow this action?
                                                                    │
                              ◄──────────  allow → do it & respond   │
                              ◄──────────  deny  → 401 / 403         ┘
```

Both halves of the identity from [Section 01](../01-introduction/03-merchants-stores-and-the-admin.md): the **`myshopify.com` domain** says *which store*, the **token** proves *you're allowed*.

---

## Anatomy of a request

Every REST Admin API call has four parts:

```
   METHOD   https://{shop}.myshopify.com/admin/api/{version}/{resource}.json
   headers  X-Shopify-Access-Token: {token}
            Content-Type: application/json      (when sending a body)
   body     { ... }                             (for POST/PUT)
```

- **`{shop}`** — the permanent `myshopify.com` subdomain (not the custom domain).
- **`{version}`** — a dated version like `2024-10`. **Always pin one.**
- **`{resource}.json`** — the object family: `products`, `customers`, `draft_orders`, `orders`.
- **`X-Shopify-Access-Token`** — carries the token. This is the auth.

The "hello world" call — fetch the store's own details:

```
GET https://himangs-tiramisu.myshopify.com/admin/api/2024-10/shop.json
    X-Shopify-Access-Token: shpat_xxxxxxxxxxxxxxxxxxxx
```

A `200` with the store name means your token works; `401` means it's wrong or missing.

---

## REST Implementation (runnable)

The smallest program that authenticates. It reads the secret from the environment — **never hard-code tokens** — using built-in `fetch` (Node 18+).

```javascript
// verify-auth.js — confirm our Admin API token works
// Run: node verify-auth.js

const SHOP = process.env.SHOPIFY_STORE;         // himangs-tiramisu.myshopify.com
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // shpat_...
const API_VERSION = "2024-10";

async function main() {
  if (!SHOP || !TOKEN) {
    throw new Error("Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN env vars.");
  }

  const url = `https://${SHOP}/admin/api/${API_VERSION}/shop.json`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": TOKEN,   // <-- the authentication
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    // 401 = bad/missing token, 403 = token lacks the needed scope
    const body = await res.text();
    throw new Error(`Request failed: ${res.status} ${res.statusText}\n${body}`);
  }

  const data = await res.json();
  console.log("Authenticated. Store:", data.shop.name, "|", data.shop.currency);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
```

The parts that matter:

- **`process.env.*`** — secrets from the environment, not the source. The most important habit in this section.
- **The URL** combines the shop domain, pinned version, and resource.
- **`X-Shopify-Access-Token`** — the token; what makes it *your* call.
- **`res.ok` check** — `401` = auth problem; `403` = valid token, missing scope.

Run it:

```bash
export SHOPIFY_STORE="himangs-tiramisu.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxx"
node verify-auth.js
# → Authenticated. Store: Himang's Tiramisu | INR
```

This pattern — read env, build URL, send token header, check `res.ok` — repeats through the section. Copy in [`examples/verify-auth.js`](../examples/verify-auth.js).

---

## GraphQL Implementation

Same token, one endpoint, `POST` only:

```
POST https://{shop}.myshopify.com/admin/api/{version}/graphql.json
     X-Shopify-Access-Token: {token}
     Content-Type: application/json
     body: { "query": "{ shop { name currencyCode } }" }
```

**Authentication is identical** — same token, same header. Only the request shape differs (Section 05's topic). **Auth is shared across REST and GraphQL; learn it once.**

---

## Production Considerations

- **Never commit tokens.** Use env vars or a secret manager; `.gitignore` your `.env`. A leaked `shpat_` token is full access.
- **Least scope.** Grant only what you use — it limits the blast radius of a leak.
- **Pin the API version** and migrate deliberately; unpinned calls break silently.
- **Handle 401 vs 403 distinctly** — `401` = bad/missing token; `403` = valid token, missing scope. Different fixes.
- **Rotate on exposure** — regenerate in the admin, invalidating the old token.
- **Mind rate limits** — a `429` means slow down ([Section 10](../10-production/)).

---

## Common Misconceptions

**❌ "I authenticate Admin calls with the API secret key."**
Admin calls use the **`shpat_` access token** in `X-Shopify-Access-Token`. The API secret is for OAuth, not everyday Admin calls.

**❌ "One token works across all my stores."**
Tokens are per-store.

**❌ "A valid token means I can do anything."**
Only what its **scopes** allow. A `403` on a valid token = "authenticated, not permitted" — add the scope and reinstall.

**❌ "The token goes in the URL."**
It goes in the `X-Shopify-Access-Token` **header**. Secrets in URLs get logged.

**❌ "I can leave the API version out."**
Pin it — relying on a default lets behavior change under you.

---

## Frequently Asked Questions

**Q: API key/secret vs. access token?**
The key/secret identify the *app* (OAuth handshake); the access token (`shpat_…`) authorizes Admin requests. For a custom app you get the token directly and rarely touch the key/secret.

**Q: Custom or public app for Himang?**
Custom — one store, token directly, no OAuth. Public apps are for many merchants and use OAuth ([Section 09](../09-authentication/)).

**Q: Different auth for GraphQL?**
No — same token, same header. Only the request shape differs (Section 05).

**Q: 403 but my token is valid — why?**
It lacks the required **scope**. Add it in the app config, reinstall to reissue the token, retry.

**Q: Where do I store the token?**
An env var or secret manager — never in code or git. Treat it like a store password.

---

## Interview Questions

1. What is an access token, and what two things does it encode?
2. Which header carries it, and what does it look like?
3. Authentication vs. authorization — which HTTP status maps to each failure?
4. Distinguish the API secret key from the access token.
5. Why pin the API version?
6. Custom vs. public app — which gives a token directly?
7. Name three of Shopify's distinct secrets and their uses.

---

## Summary

- Every Admin API call needs an **access token** (`shpat_…`) in the **`X-Shopify-Access-Token` header** — authentication *and* authorization in one string.
- A token is **per-store** and **scope-limited**.
- You get one from a **custom app** (direct token, no OAuth); **public apps** use OAuth.
- Don't confuse the secrets: **access token** authorizes Admin calls, **API secret** is for OAuth, **webhook secret** verifies webhooks.
- A request is `{shop}.myshopify.com/admin/api/{version}/{resource}.json` + the token header. **Pin the version.** Handle `401` vs `403` distinctly.
- **Auth is shared with GraphQL.**

---

## What's Next

→ **Next: [Products & Variants over REST](02-products-and-variants-over-rest.md)** — list, fetch, and create products (and get the variant IDs the pipeline needs) using this auth pattern.
