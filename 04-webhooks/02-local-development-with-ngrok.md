# Local Development with ngrok

You want to test webhooks on your laptop. But a webhook is Shopify making an HTTP call *to your server*, and your dev server runs on `localhost` — an address Shopify cannot reach. This short chapter explains why, and how a tunnel like **ngrok** solves it.

---

## Business Problem

You're building Himang's webhook handler. You run it locally:

```
http://localhost:3000/webhooks/orders
```

You subscribe Shopify to `orders/create` pointing at that URL... and nothing arrives. Of course not: **`localhost` means "this machine."** When Shopify tries to `POST` to `localhost:3000`, it would be calling *itself*, not your laptop. Shopify has no route to a private address sitting behind your home router.

So the problem: **how does a server on the public internet (Shopify) deliver an HTTP request to a server on your private machine (`localhost`)?**

---

## Mental Model

> `localhost` (`127.0.0.1`) is a *private* address, reachable only from your own machine. So is your laptop's LAN IP behind a router doing NAT. Shopify, out on the public internet, can reach neither. A **tunnel** gives your local server a *public* address that forwards inbound requests to it.

Why can't Shopify reach you directly? Two layers:

- **`localhost` is loopback** — it never leaves your machine. It's definitionally not remote-reachable.
- **NAT / firewall** — even your laptop's real LAN IP sits behind a router that blocks unsolicited inbound connections. There's no public door to your dev server.

A tunnel service (ngrok is the common one) fixes this by giving you a **public URL** it owns, and forwarding anything sent there down an outbound connection your laptop opened to it:

```
   Shopify ──POST──► https://abc123.ngrok.io  ──(tunnel)──► http://localhost:3000
                     (public, ngrok-owned)                  (your private server)
```

Analogy: your local server is a house with no street address. ngrok gives you a **PO box** on a public street; mail sent there is forwarded to your unlisted house.

---

## Architecture

```
   ┌───────────┐        ┌─────────────────────┐        ┌──────────────────────┐
   │  Shopify   │ ─POST─►│  ngrok public URL    │ ─────► │ your laptop           │
   │ (internet) │        │  https://abc.ngrok.io│ tunnel │ localhost:3000        │
   └───────────┘        └─────────────────────┘        │ (webhook handler)     │
        ▲                         │                      └──────────────────────┘
        │                         │ ngrok inspects/forwards
        └──── register this ──────┘
              public URL as the
              webhook address
```

The key move: you register the **ngrok URL** (not `localhost`) as your webhook `address` in Shopify.

---

## How it works in practice

1. **Run your local server** (the Express handler you'll build next chapter):

   ```
   node webhook-server.js      # listening on localhost:3000
   ```

2. **Start a tunnel** to that port:

   ```
   ngrok http 3000
   ```

   ngrok prints a public HTTPS URL, e.g. `https://abc123.ngrok.io`, forwarding to `localhost:3000`.

3. **Register that public URL** as the webhook address in Shopify (admin or `POST /webhooks.json` from [Section 04, Ch. 01](01-what-are-webhooks.md)):

   ```
   address: https://abc123.ngrok.io/webhooks/orders
   ```

4. **Trigger the event** (complete a draft order, or use Shopify's "send test notification"). Shopify `POST`s the ngrok URL → ngrok forwards to `localhost:3000` → your handler runs. You can watch each request in ngrok's local inspector (usually `http://localhost:4040`).

---

## Production Considerations

- **ngrok is for development only.** In production you deploy your server to a real host with a stable public HTTPS URL, and register *that*. The tunnel is scaffolding you remove.
- **HTTPS is required.** Shopify delivers webhooks over HTTPS. ngrok gives you an HTTPS URL for free; a production host needs a valid TLS certificate.
- **Free ngrok URLs change on restart.** Each `ngrok http` session may hand you a new subdomain, meaning you must re-register the webhook address. A reserved/static domain (paid, or an alternative tunnel) avoids the churn.
- **Anyone with the URL can hit it.** A tunnel exposes your dev server to the public internet for the session. This is *exactly* why webhook signature verification (next chapters) matters even in development — the URL is not a secret.
- **Alternatives exist.** Cloudflare Tunnel, localtunnel, and the Shopify CLI's built-in tunneling do the same job. ngrok is just the most common name.

---

## Common Misconceptions

**❌ "I'll just give Shopify my `localhost:3000` URL."**
Reality: `localhost` is your machine only; Shopify can't reach it. You need a public URL that forwards to your local server.

**❌ "My laptop's Wi-Fi IP will work as the webhook address."**
Reality: That IP sits behind NAT/firewall with no public inbound route. Still unreachable from Shopify without a tunnel or port-forwarding.

**❌ "ngrok is part of my production setup."**
Reality: It's a dev tool. Production uses a deployed server with a stable public HTTPS endpoint.

**❌ "Because the ngrok URL is random, it's secure enough to skip verification."**
Reality: The URL is public and guessable-once-known; it's not authentication. Always verify the HMAC (Chapters 03–04).

---

## Frequently Asked Questions

**Q: Why can't Shopify call `localhost`?**
`localhost`/`127.0.0.1` is a loopback address meaning "this same machine." When Shopify resolves it, it points at Shopify's own server, not yours. And your real LAN IP is hidden behind NAT/firewall. A tunnel provides a public address that forwards to your local port.

**Q: What does ngrok actually do?**
It opens an outbound connection from your machine to ngrok's servers and gives you a public HTTPS URL. Requests to that URL are forwarded down the tunnel to your local port, and responses go back the same way.

**Q: Do I need ngrok in production?**
No. Deploy your server somewhere with a stable public HTTPS URL and register that. ngrok is only to test locally.

**Q: The webhook stopped arriving after I restarted ngrok — why?**
A new session likely gave you a new URL, so the old registered address no longer points anywhere. Re-register with the new URL, or use a reserved static domain.

**Q: Is exposing my dev server like this dangerous?**
It's public for the session, so treat it accordingly — and never skip signature verification. That's precisely why the next chapters exist.

---

## Interview Questions

1. Why can't Shopify deliver a webhook to `http://localhost:3000`?
2. What two networking realities make your local dev server unreachable from the internet?
3. What does a tunnel like ngrok provide, and how does traffic flow through it?
4. Which URL do you register as the webhook address — `localhost` or the tunnel URL?
5. Why is ngrok inappropriate for production, and what replaces it?
6. Why does the public nature of the tunnel URL reinforce the need for HMAC verification?

---

## Summary

- Shopify can't reach **`localhost`** (loopback) or your **NAT-hidden LAN IP**, so webhooks won't arrive at a raw local server.
- A **tunnel** (ngrok, Cloudflare Tunnel, Shopify CLI, …) gives your local server a **public HTTPS URL** that **forwards** inbound requests to your local port.
- Workflow: run the local server → `ngrok http 3000` → register the **ngrok URL** as the webhook address → trigger the event → the delivery is forwarded to your handler.
- ngrok is **development-only** (production uses a deployed public HTTPS host), free URLs **change on restart**, and the URL is **public** — which is one more reason **signature verification is mandatory** (next chapters).

---

## What's Next

With a public URL forwarding to your machine, you can finally receive a webhook. But *how* you read the request body turns out to be subtle — and getting it wrong silently breaks signature verification.

→ **Next chapter: [`express.raw()` vs `express.json()`](03-express-raw-vs-json.md)** — why webhook verification needs the exact raw bytes, and why the usual JSON body parser sabotages it.
