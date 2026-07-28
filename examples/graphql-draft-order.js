// graphql-draft-order.js — create a draft order via the GraphQL Admin API.
//
// Introduced across: 05-graphql/ (chapters 01-06)
//
// Shows the GraphQL twin of examples/create-draft-order.js:
//   - one endpoint (/graphql.json), same access token          (ch. 01)
//   - a named mutation with variables                          (ch. 02, 03)
//   - global IDs for the variant and customer                  (ch. 04)
//   - checking all three error channels, incl. userErrors      (ch. 06)
//
// Usage:
//   export SHOPIFY_STORE="himangs-tiramisu.myshopify.com"
//   export SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxx"
//   export VARIANT_ID=9002      # REST integer id (from chapter 02)
//   export CUSTOMER_ID=7001     # REST integer id (from chapter 03)
//   node graphql-draft-order.js
//
// Requires Node.js 18+ (built-in global fetch).

const SHOP = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API = "2024-10";

// REST integer id -> GraphQL global id (chapter 04).
const gid = (type, id) => `gid://shopify/${type}/${id}`;

// One helper that checks all three failure channels (chapter 06).
async function graphql(query, variables) {
  const res = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN, // same auth as REST (chapter 01)
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }), // the { query, variables } body (chapter 03)
  });

  // Channel 0: HTTP transport.
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const json = await res.json();

  // Channel 1: top-level errors (malformed query, auth, type).
  if (json.errors?.length) {
    throw new Error("Query errors: " + JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

const CREATE_DRAFT = `
  mutation CreateDraft($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { id status totalPrice invoiceUrl }
      userErrors { field message }
    }
  }
`;

async function main() {
  if (!SHOP || !TOKEN) throw new Error("Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN.");

  const variantId = gid("ProductVariant", process.env.VARIANT_ID || 9002);
  const customerId = gid("Customer", process.env.CUSTOMER_ID || 7001);

  const data = await graphql(CREATE_DRAFT, {
    input: {
      lineItems: [{ variantId, quantity: 2 }],
      customerId,
    },
  });

  const result = data.draftOrderCreate;

  // Channel 2: business errors (chapter 06). HTTP was 200 even if this failed.
  if (result.userErrors.length) {
    throw new Error(
      "Business error: " + result.userErrors.map((e) => `${e.field}: ${e.message}`).join("; ")
    );
  }

  const d = result.draftOrder;
  console.log(`Draft order created: ${d.id}`);
  console.log(`  status: ${d.status}  total: ${d.totalPrice}`);
  console.log(`  invoiceUrl: ${d.invoiceUrl}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
