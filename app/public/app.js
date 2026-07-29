// app.js — the browser-side of the mini admin.
//
// It talks ONLY to our own /api/* routes. It never sees the Shopify access
// token — that stays on the server (Section 01 trust boundary).

// --- tiny helpers ----------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("err", isError);
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3200);
}

// Wrapper around fetch that surfaces our JSON error shape nicely.
async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      data.shopify && data.shopify.errors
        ? JSON.stringify(data.shopify.errors)
        : data.error || res.statusText;
    throw new Error(detail);
  }
  return data;
}

let VARIANTS_CACHE = []; // flattened variants for the draft-order dropdowns

// --- tabs ------------------------------------------------------------------
$("#tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  const tab = btn.dataset.tab;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  document.querySelectorAll(".panel").forEach((p) =>
    p.classList.toggle("active", p.id === `tab-${tab}`)
  );
  LOADERS[tab] && LOADERS[tab]();
});

// --- shop info -------------------------------------------------------------
async function loadShop() {
  const info = $("#shop-info");
  try {
    const shop = await api("/api/shop");
    info.textContent = `${shop.name} · ${shop.domain} · ${shop.currency}`;
    info.className = "shop-info ok";
  } catch (err) {
    info.textContent = "Not connected — check .env";
    info.className = "shop-info err";
  }
}

// --- products --------------------------------------------------------------
async function loadProducts() {
  const box = $("#products-list");
  box.innerHTML = "Loading…";
  try {
    const products = await api("/api/products");
    VARIANTS_CACHE = [];
    if (!products.length) {
      box.innerHTML = '<p class="empty">No products yet. Create some (see Section 03).</p>';
      return;
    }
    box.innerHTML = "";
    for (const p of products) {
      const rows = p.variants
        .map((v) => {
          VARIANTS_CACHE.push({ id: v.id, label: `${p.title} — ${v.title} (₹${v.price})`, price: v.price });
          return `<tr>
            <td>${esc(v.title)}</td>
            <td class="mono">${v.id}</td>
            <td>₹${esc(v.price)}</td>
            <td>${esc(v.sku || "—")}</td>
            <td>${v.inventory ?? "—"}</td>
          </tr>`;
        })
        .join("");
      box.appendChild(
        el(`<div class="card product-card">
          <h3>${esc(p.title)} <span class="product-id">product ${p.id}</span></h3>
          <table>
            <thead><tr><th>Variant</th><th>Variant ID</th><th>Price</th><th>SKU</th><th>Stock</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`)
      );
    }
  } catch (err) {
    box.innerHTML = `<p class="empty">Error: ${esc(err.message)}</p>`;
  }
}

// --- customers -------------------------------------------------------------
async function loadCustomers() {
  const box = $("#customers-list");
  const q = $("#customer-search").value.trim();
  box.innerHTML = "Loading…";
  try {
    const customers = await api("/api/customers" + (q ? `?q=${encodeURIComponent(q)}` : ""));
    populateCustomerDropdown(customers);
    if (!customers.length) {
      box.innerHTML = '<p class="empty">No customers found.</p>';
      return;
    }
    const rows = customers
      .map(
        (c) => `<tr>
          <td>${esc(c.name || "—")}</td>
          <td>${esc(c.email)}</td>
          <td class="mono">${c.id}</td>
          <td>${c.ordersCount ?? 0}</td>
        </tr>`
      )
      .join("");
    box.innerHTML = `<div class="card"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Customer ID</th><th>Orders</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } catch (err) {
    box.innerHTML = `<p class="empty">Error: ${esc(err.message)}</p>`;
  }
}

function populateCustomerDropdown(customers) {
  const sel = $("#draft-customer");
  const current = sel.value;
  sel.innerHTML = '<option value="">— none —</option>';
  for (const c of customers) {
    sel.appendChild(el(`<option value="${c.id}">${esc(c.name || c.email)} (${esc(c.email)})</option>`));
  }
  sel.value = current;
}

$("#customer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const msg = $("#customer-msg");
  msg.textContent = "Working…";
  msg.className = "form-msg";
  const address = f.address1.value
    ? { address1: f.address1.value, city: f.city.value, country: f.country.value }
    : null;
  try {
    const { customer, created } = await api("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: f.email.value,
        firstName: f.firstName.value,
        lastName: f.lastName.value,
        address,
      }),
    });
    msg.textContent = `${created ? "Created" : "Found"} customer ${customer.id}`;
    msg.className = "form-msg ok";
    toast(`${created ? "Created" : "Found"} customer ${customer.email}`);
    loadCustomers();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "form-msg err";
  }
});

// --- create draft order ----------------------------------------------------
function addLineItemRow() {
  if (!VARIANTS_CACHE.length) {
    toast("Load Products first so variants are available.", true);
    return;
  }
  const options = VARIANTS_CACHE.map((v) => `<option value="${v.id}">${esc(v.label)}</option>`).join("");
  const row = el(`<div class="line-item-row">
    <select class="li-variant">${options}</select>
    <input class="li-qty" type="number" min="1" value="1" />
    <button class="btn small" type="button">✕</button>
  </div>`);
  row.querySelector("button").addEventListener("click", () => row.remove());
  $("#line-items").appendChild(row);
}

$("#draft-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#draft-msg");
  const rows = document.querySelectorAll("#line-items .line-item-row");
  if (!rows.length) {
    msg.textContent = "Add at least one line item.";
    msg.className = "form-msg err";
    return;
  }
  const lineItems = [...rows].map((r) => ({
    variantId: r.querySelector(".li-variant").value,
    quantity: r.querySelector(".li-qty").value,
  }));
  const customerId = $("#draft-customer").value || null;

  msg.textContent = "Creating…";
  msg.className = "form-msg";
  try {
    const draft = await api("/api/draft-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineItems, customerId }),
    });
    msg.textContent = `Created ${draft.name} — total ₹${draft.total_price} (order_id: ${draft.order_id})`;
    msg.className = "form-msg ok";
    toast(`Draft ${draft.name} created`);
    $("#line-items").innerHTML = "";
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "form-msg err";
  }
});

// --- draft orders ----------------------------------------------------------
async function loadDrafts() {
  const box = $("#drafts-list");
  box.innerHTML = "Loading…";
  try {
    const drafts = await api("/api/draft-orders");
    if (!drafts.length) {
      box.innerHTML = '<p class="empty">No draft orders yet.</p>';
      return;
    }
    const rows = drafts
      .map((d) => {
        const statusClass = d.status === "completed" ? "done" : d.status === "invoice_sent" ? "sent" : "open";
        const canAct = d.status !== "completed";
        return `<tr>
          <td>${esc(d.name)}</td>
          <td><span class="pill ${statusClass}">${esc(d.status)}</span></td>
          <td>${esc(d.customer || "—")}</td>
          <td>₹${esc(d.total)}</td>
          <td>${d.orderId ? `order ${d.orderId}` : "—"}</td>
          <td class="actions">
            ${canAct ? `<button class="btn small" onclick="sendInvoice(${d.id})">Send invoice</button>` : ""}
            ${canAct ? `<button class="btn small primary" onclick="completeDraft(${d.id})">Mark paid</button>` : ""}
            ${d.invoiceUrl ? `<a class="btn small" href="${esc(d.invoiceUrl)}" target="_blank" rel="noopener">Invoice&nbsp;↗</a>` : ""}
          </td>
        </tr>`;
      })
      .join("");
    box.innerHTML = `<div class="card"><table>
      <thead><tr><th>Draft</th><th>Status</th><th>Customer</th><th>Total</th><th>Order</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } catch (err) {
    box.innerHTML = `<p class="empty">Error: ${esc(err.message)}</p>`;
  }
}

async function sendInvoice(id) {
  try {
    await api(`/api/draft-orders/${id}/send-invoice`, { method: "POST" });
    toast("Invoice sent (status → invoice_sent)");
    loadDrafts();
  } catch (err) {
    toast(err.message, true);
  }
}

async function completeDraft(id) {
  if (!confirm("Mark this draft as paid and create a real order?")) return;
  try {
    const d = await api(`/api/draft-orders/${id}/complete?paymentPending=false`, { method: "POST" });
    toast(`Completed → order ${d.order_id}`);
    loadDrafts();
  } catch (err) {
    toast(err.message, true);
  }
}

// --- orders ----------------------------------------------------------------
async function loadOrders() {
  const box = $("#orders-list");
  box.innerHTML = "Loading…";
  try {
    const orders = await api("/api/orders");
    if (!orders.length) {
      box.innerHTML = '<p class="empty">No orders yet. Complete a draft order to create one.</p>';
      return;
    }
    const rows = orders
      .map((o) => {
        const fin = (o.financialStatus || "pending").toLowerCase();
        const ful = o.fulfillmentStatus ? o.fulfillmentStatus.toLowerCase() : "unfulfilled";
        return `<tr>
          <td>${esc(o.name)}</td>
          <td><span class="pill ${fin}">${esc(o.financialStatus || "pending")}</span></td>
          <td><span class="pill ${ful}">${esc(o.fulfillmentStatus || "unfulfilled")}</span></td>
          <td>${esc(o.customer || "—")}</td>
          <td>₹${esc(o.total)}</td>
        </tr>`;
      })
      .join("");
    box.innerHTML = `<div class="card"><table>
      <thead><tr><th>Order</th><th>Financial</th><th>Fulfillment</th><th>Customer</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } catch (err) {
    box.innerHTML = `<p class="empty">Error: ${esc(err.message)}</p>`;
  }
}

// --- webhooks --------------------------------------------------------------
async function loadWebhooks() {
  const box = $("#webhooks-list");
  box.innerHTML = "Loading…";
  try {
    const hooks = await api("/api/webhooks/recent");
    if (!hooks.length) {
      box.innerHTML = '<p class="empty">No webhooks received yet. Configure a subscription and trigger an order.</p>';
      return;
    }
    const rows = hooks
      .map(
        (h) => `<tr>
          <td class="mono">${esc(h.topic)}</td>
          <td>${esc(h.name || h.orderId)}</td>
          <td><span class="pill ${(h.financialStatus || "pending").toLowerCase()}">${esc(h.financialStatus || "—")}</span></td>
          <td>${esc(new Date(h.at).toLocaleString())}</td>
        </tr>`
      )
      .join("");
    box.innerHTML = `<div class="card"><table>
      <thead><tr><th>Topic</th><th>Order</th><th>Financial</th><th>Received</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } catch (err) {
    box.innerHTML = `<p class="empty">Error: ${esc(err.message)}</p>`;
  }
}

// --- wire up ---------------------------------------------------------------
const LOADERS = {
  products: loadProducts,
  customers: loadCustomers,
  create: () => {},
  drafts: loadDrafts,
  orders: loadOrders,
  webhooks: loadWebhooks,
};

loadShop();
loadProducts();
