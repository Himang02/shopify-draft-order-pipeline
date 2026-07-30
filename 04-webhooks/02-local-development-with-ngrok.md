# Local Development with ngrok

A webhook is Shopify calling *your server* — but your dev server runs on `localhost`, which Shopify can't reach. This short chapter explains why, and how a tunnel like **ngrok** fixes it.

---

## Business Problem

You run Himang's handler locally at `http://localhost:3000/webhooks/orders`, subscribe Shopify to it... and nothing arrives. Of course: **`localhost` means "this machine."** Shopify POSTing `localhost:3000` would call *itself*, not your laptop — and your laptop sits behind a router with no public inbound route.

So: **how does a server on the public internet deliver a request to a server on your private machine?**

---

## Mental Model

> `localhost` (`127.0.0.1`) is reachable only from your own machine; so is your LAN IP behind NAT. Shopify can reach neither. A **tunnel** gives your local server a *public* address that forwards inbound requests to it.

Two reasons Shopify can't reach you directly:

- **`localhost` is loopback** — never leaves your machine.
- **NAT / firewall** — your LAN IP has no public door.

A tunnel (ngrok is the common one) gives you a **public URL** and forwards traffic down an outbound connection your laptop opened:

```
   Shopify ──POST──► https://abc123.ngrok.io  ──(tunnel)──► http://localhost:3000
                     (public, ngrok-owned)                  (your private server)
```

Analogy: your server is a house with no street address; ngrok is a **PO box** on a public street that forwards mail to it.

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

The key move: register the **ngrok URL** (not `localhost`) as your webhook `address`.

---

## In practice

1. **Run your local server:** `node webhook-server.js` (listening on `localhost:3000`).
2. **Start a tunnel:** `ngrok http 3000` → prints a public HTTPS URL like `https://abc123.ngrok.io`.
3. **Register that URL** as the webhook address (admin or `POST /webhooks.json`): `https://abc123.ngrok.io/webhooks/orders`.
4. **Trigger the event** (complete a draft, or Shopify's "send test notification"). Shopify POSTs the ngrok URL → forwarded to `localhost:3000`. Watch each request in ngrok's inspector at `http://localhost:4040`.

---

## Production Considerations

- **ngrok is development-only.** Production deploys to a real host with a stable public HTTPS URL; register *that*.
- **HTTPS is required.** ngrok gives it free; production needs a valid TLS certificate.
- **Free ngrok URLs change on restart** — re-register the address, or use a reserved static domain.
- **The URL is public** — anyone who knows it can hit it. This is exactly why signature verification matters even in dev.
- **Alternatives:** Cloudflare Tunnel, localtunnel, the Shopify CLI's tunneling. Same job.

---

## Common Misconceptions

**❌ "I'll give Shopify my `localhost:3000` URL."**
`localhost` is your machine only. You need a public URL that forwards to it.

**❌ "My Wi-Fi IP will work."**
It's behind NAT/firewall — no public inbound route without a tunnel.

**❌ "ngrok is part of production."**
It's a dev tool; production uses a deployed public HTTPS endpoint.

**❌ "The random ngrok URL is secure enough to skip verification."**
The URL is public, not authentication. Always verify the HMAC (Chapters 03–04).

---

## Frequently Asked Questions

**Q: Why can't Shopify call `localhost`?**
It's a loopback address ("this same machine") and your LAN IP is NAT-hidden. A tunnel provides a public address that forwards to your local port.

**Q: What does ngrok do?**
Opens an outbound connection to ngrok's servers and gives you a public HTTPS URL; requests there are forwarded down the tunnel to your port.

**Q: Need ngrok in production?**
No — deploy to a stable public HTTPS host and register that.

**Q: Webhook stopped after I restarted ngrok — why?**
A new session gave a new URL; the old address points nowhere. Re-register, or use a reserved domain.

**Q: Is exposing my dev server dangerous?**
It's public for the session — treat it so, and never skip verification.

---

## Interview Questions

1. Why can't Shopify deliver to `http://localhost:3000`?
2. What two networking realities make a local server unreachable?
3. What does a tunnel provide, and how does traffic flow?
4. Which URL do you register — `localhost` or the tunnel URL?
5. Why is ngrok wrong for production, and what replaces it?
6. Why does the public tunnel URL reinforce the need for HMAC verification?

---

## Summary

- Shopify can't reach **`localhost`** or your **NAT-hidden LAN IP**, so webhooks won't arrive at a raw local server.
- A **tunnel** gives your local server a **public HTTPS URL** that **forwards** inbound requests to your port.
- Workflow: run server → `ngrok http 3000` → register the **ngrok URL** → trigger the event.
- ngrok is **dev-only**, free URLs **change on restart**, and the URL is **public** — one more reason **verification is mandatory**.

---

## What's Next

You can now receive a webhook. But *how* you read the body is subtle — get it wrong and signature verification silently breaks.

→ **Next: [`express.raw()` vs `express.json()`](03-express-raw-vs-json.md)** — why verification needs the exact raw bytes.
