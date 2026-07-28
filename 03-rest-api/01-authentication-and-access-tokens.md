# Authentication & the Admin API Access Token

Section 02 was all concepts and JSON shapes. Now we make real calls — and the very first thing any real call needs is **proof that you're allowed to make it**. This chapter is about that proof: what an Admin API access token is, where it comes from, and how you attach it to a request.

Get this chapter right and every other call in Section 03 is just "same auth, different endpoint."

---

## Business Problem

Himang's store holds real customer data and real orders. Shopify obviously can't let *anyone* who knows the store's URL read Alice's address or create orders. So before your server can touch the Admin API, it has to answer one question to Shopify's satisfaction:

> "Who are you, and are you allowed to do this to *this* store?"

That's **authentication** (who you are) and **authorization** (what you're allowed to do). For the Admin API, both are carried by a single credential: an **access token**.

---

## Mental Model

> An **Admin API access token** is a secret string that says "the bearer of this token is allowed to act on *this specific store*, within *these specific permissions*."

Two anchors from earlier chapters make this concrete:

- **Per-store.** Recall stores are isolated tenants ([Section 01, Ch. 03](../01-introduction/03-merchants-stores-and-the-admin.md)). A token belongs to exactly one store. Himang's token works on Himang's store and nowhere else.
- **Permission-scoped.** Recall staff permissions ([same chapter](../01-introduction/03-merchants-stores-and-the-admin.md)). A token is granted specific **scopes** — `read_products`, `write_draft_orders`, and so on — exactly like a staff member is granted permissions. The token can do only what its scopes allow.

Analogy: the token is a **key card** for one building (one store) that opens only certain doors (its scopes). Lose it and someone else can walk in — so it's a secret.

---

## Where the token comes from: custom apps

To get a token, you create an **app** on the store. Recall from [Section 01](../01-introduction/01-what-is-shopify.md) that "your server with a token" *is* the simplest form of a Shopify app. For a single store you control — exactly Himang's situation — the right kind is a **custom app**.

The setup, done once in the Shopify admin:

```
Shopify Admin → Settings → Apps and sales channels
             → Develop apps → Create an app
             → Configure Admin API scopes  (tick read_products, write_draft_orders, ...)
             → Install app
             → Reveal the Admin API access token   ←  this is your secret
```

The result is a token that looks like:

```
shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Two things to know:

- The `shpat_` prefix marks it as a **Sh**opify **p**rivate/custom-app **a**ccess **t**oken. (You'll meet other credential types shortly.)
- You see the full token **once**. Copy it into a secret store immediately; if you lose it you regenerate (which invalidates the old one).

> **Custom app vs. public app:** a *custom app* is built for one store and gives you a token directly — perfect for Himang. A *public app* is distributed to many stores and obtains tokens through **OAuth**, a multi-step handshake. We use custom apps for all of Section 03 and cover OAuth in [Section 09](../09-authentication/). Same kind of token at the end; different way of getting it.

---

## The many "secrets" — and which one this is

Beginners drown in Shopify's credential names. Here's the map, so you know exactly which string does what:

| Credential | What it's for | Used in this section? |
|-----------|---------------|----------------------|
| **Admin API access token** (`shpat_…`) | Authorize Admin API calls. **This chapter.** | ✅ Yes — the one you need |
| **API key** & **API secret key** | Identify the *app* itself; used in the OAuth handshake for public apps. | Later ([Section 09](../09-authentication/)) |
| **Webhook signing secret** | Verify that an incoming webhook really came from Shopify. | [Section 04](../04-webhooks/) |
| **Storefront API access token** | Public, browser-safe token for the Storefront API. | Not this flow ([Section 01](../01-introduction/01-what-is-shopify.md)) |

The single most common beginner mix-up — using the **API secret** to verify webhooks — gets its own correction in [Section 04](../04-webhooks/). For now: **the credential that authorizes your Admin API calls is the `shpat_` access token, nothing else.**

---

## Architecture: how a request is authenticated

Every Admin API request carries the token in a header, and Shopify checks it before doing anything:

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

Notice both halves of the identity from [Section 01](../01-introduction/03-merchants-stores-and-the-admin.md) at work: the **`myshopify.com` domain in the URL** says *which store*, and the **token in the header** proves *you're allowed*. Together they pin the request to one tenant with one permission set.

---

## The anatomy of a request

Every REST Admin API call has the same four parts. Learn them once:

```
   METHOD   https://{shop}.myshopify.com/admin/api/{version}/{resource}.json
   headers  X-Shopify-Access-Token: {token}
            Content-Type: application/json      (when sending a body)
   body     { ... }                             (for POST/PUT)
```

- **`{shop}`** — the store's permanent `myshopify.com` subdomain (not the custom domain — [Section 01, Ch. 03](../01-introduction/03-merchants-stores-and-the-admin.md)).
- **`{version}`** — a dated API version like `2024-10`. **Always pin one explicitly** ([Section 01](../01-introduction/01-what-is-shopify.md)); leaving it out or drifting invites breakage.
- **`{resource}.json`** — the object family: `products`, `customers`, `draft_orders`, `orders`.
- **`X-Shopify-Access-Token`** — the header carrying your `shpat_` token. This is the auth.

A first real call — fetch the store's own details (the `shop` object from [Section 01](../01-introduction/03-merchants-stores-and-the-admin.md)), which is the "hello world" of the Admin API:

```
GET https://himangs-tiramisu.myshopify.com/admin/api/2024-10/shop.json
    X-Shopify-Access-Token: shpat_xxxxxxxxxxxxxxxxxxxx
```

A `200` with the store's name and currency means your token works. A `401 Unauthorized` means the token is wrong or missing.

---

## REST Implementation (runnable)

Here's the smallest real Node.js program that authenticates and calls the API. It reads the secret from an environment variable — **never hard-code tokens** — and uses the built-in `fetch` (Node 18+).

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

Line by line, the parts that matter:

- **`process.env.*`** — secrets come from the environment, not the source. This is the single most important security habit in the whole section.
- **The URL** combines the `myshopify.com` shop domain, the pinned `API_VERSION`, and the `shop.json` resource.
- **`X-Shopify-Access-Token`** header — the token. This is what makes it *your* authenticated call.
- **`res.ok` check** — always handle failure. `401` = auth problem; `403` = authenticated but the token's scopes don't permit this.

Run it:

```bash
export SHOPIFY_STORE="himangs-tiramisu.myshopify.com"
export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxx"
node verify-auth.js
# → Authenticated. Store: Himang's Tiramisu | INR
```

This exact pattern — read env, build URL, send token header, check `res.ok` — repeats in every remaining chapter of this section. A runnable copy lives in [`examples/verify-auth.js`](../examples/verify-auth.js).

---

## GraphQL Implementation

Same token, one endpoint, `POST` only:

```
POST https://{shop}.myshopify.com/admin/api/{version}/graphql.json
     X-Shopify-Access-Token: {token}
     Content-Type: application/json
     body: { "query": "{ shop { name currencyCode } }" }
```

The **authentication is identical** — the same `shpat_` token in the same header. What differs is only the *shape* of the request (one `graphql.json` endpoint, query in the body), which is Section 05's whole topic. The takeaway here: **auth is shared across REST and GraphQL; you learn it once.**

---

## Production Considerations

- **Never commit tokens.** Keep them in environment variables or a secret manager. Add `.env` to `.gitignore` (this repo already does). A leaked `shpat_` token is full access to the store's data.
- **Request the least scope you need.** If your integration only creates draft orders, don't grant `write_orders` or customer-read scopes you won't use. Least privilege limits the blast radius of a leak.
- **Always pin the API version.** Hard-code `2024-10` (or whichever) and migrate deliberately. Unpinned calls break silently when Shopify moves on.
- **Handle 401 vs 403 distinctly.** `401` → the token is bad/missing (auth). `403` → the token is valid but lacks the scope (authorization). They need different fixes; don't lump them together.
- **Rotate on exposure.** If a token might have leaked, regenerate it in the admin immediately — that invalidates the old one.
- **Mind rate limits.** Authenticated doesn't mean unlimited. REST uses a leaky-bucket limit; a `429` means slow down. Details in [Section 10](../10-production/).

---

## Common Misconceptions

**❌ "I use the API secret key to authenticate Admin API calls."**
Reality: Admin API calls use the **`shpat_` access token** in the `X-Shopify-Access-Token` header. The API secret is for the OAuth/app-identity flow, not for authorizing everyday Admin calls.

**❌ "One token works across all my stores."**
Reality: Tokens are per-store. Each store's app issues its own token, valid only for that store.

**❌ "A valid token means I can do anything."**
Reality: A token can only do what its **scopes** allow. A `403` on a valid token means "authenticated, but not permitted" — you need to add the scope and reinstall.

**❌ "The token goes in the URL / as a query parameter."**
Reality: It goes in the `X-Shopify-Access-Token` **header**. Putting secrets in URLs risks them being logged.

**❌ "I can leave the API version out of the URL."**
Reality: Pin it explicitly. Relying on a default means your integration's behavior can change under you without warning.

---

## Frequently Asked Questions

**Q: What's the difference between the API key/secret and the access token?**
The **API key/secret** identify the *app* and are used in the OAuth handshake (public apps). The **access token** (`shpat_…`) is what actually authorizes Admin API requests. For a custom app on one store, you get the access token directly and rarely touch the key/secret.

**Q: Custom app or public app for Himang's store?**
Custom app. It's built for a single store you control and hands you a token immediately — no OAuth. Public apps are for distributing to many merchants and require OAuth ([Section 09](../09-authentication/)).

**Q: How is authentication different for GraphQL?**
It isn't. Same `shpat_` token, same header. Only the request shape and endpoint differ (Section 05).

**Q: I got a 403 but my token is valid — why?**
The token lacks the required **scope** for that action. Add the scope in the app configuration, reinstall the app to reissue the token, and retry.

**Q: Where should I store the token?**
In an environment variable or a dedicated secret manager — never in code or in git. Treat it like a password to the store's data.

---

## Interview Questions

1. What is an Admin API access token, and what two things does it encode (identity and what else)?
2. Which HTTP header carries the token, and what does it look like?
3. What's the difference between authentication and authorization, and which HTTP status maps to each failure?
4. Distinguish the API secret key from the access token.
5. Why must the API version be pinned in the URL?
6. Custom app vs. public app — which gives you a token directly, and which uses OAuth?
7. Name three of Shopify's distinct "secrets" and what each is for.

---

## Summary

- Every Admin API call needs an **access token** (`shpat_…`) carried in the **`X-Shopify-Access-Token` header**. That's authentication *and* authorization in one string.
- A token is **per-store** and **scope-limited** — it acts on one tenant and can do only what its scopes permit.
- You get a token by creating a **custom app** on the store (direct token, no OAuth). **Public apps** use OAuth ([Section 09](../09-authentication/)).
- Don't confuse Shopify's secrets: the **access token** authorizes Admin calls; the **API secret** is for OAuth; the **webhook secret** verifies webhooks ([Section 04](../04-webhooks/)).
- A request is `METHOD {shop}.myshopify.com/admin/api/{version}/{resource}.json` + the token header. **Pin the version.** Handle `401` (bad token) and `403` (missing scope) distinctly.
- **Auth is shared with GraphQL** — same token, same header — so you learn it exactly once.

---

## What's Next

Your server can now prove who it is. Time to use that to read and write real catalog data.

→ **Next chapter: [Products & Variants over REST](02-products-and-variants-over-rest.md)** — list, fetch, and create products (and get the variant IDs the draft-order pipeline depends on) using the authenticated request pattern from this chapter.
