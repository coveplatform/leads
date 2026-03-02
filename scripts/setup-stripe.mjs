// One-time Stripe setup script for Cove
// Creates: product, monthly + annual prices, webhook endpoint, billing portal config
//
// Usage:
//   STRIPE_SECRET_KEY=sk_live_... node scripts/setup-stripe.mjs
//
// Run ONCE. It will print the env vars to add to Vercel.

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Error: STRIPE_SECRET_KEY env var is required");
  console.error("Usage: STRIPE_SECRET_KEY=sk_live_... node scripts/setup-stripe.mjs");
  process.exit(1);
}

if (key.startsWith("sk_test_")) {
  console.warn("⚠️  Warning: using a TEST key — this will create test-mode objects only.");
  console.warn("   Use sk_live_... for production setup.\n");
}

const stripe = new Stripe(key);
const baseUrl = process.env.PRODUCTION_URL || "https://usecove.app";

console.log(`Setting up Stripe for Cove → ${baseUrl}\n`);

// ─── 1. Product ───

const product = await stripe.products.create({
  name: "Cove",
  description: "SMS lead qualification for small businesses. Automatically follows up missed calls via text.",
  metadata: { app: "cove" },
});
console.log(`✓ Product:        ${product.id}  (${product.name})`);

// ─── 2. Monthly price — $89 AUD ───

const monthly = await stripe.prices.create({
  product: product.id,
  unit_amount: 8900,
  currency: "aud",
  recurring: { interval: "month" },
  nickname: "Monthly",
  metadata: { plan: "self_serve_monthly" },
});
console.log(`✓ Monthly price:  ${monthly.id}  ($89.00 AUD/mo)`);

// ─── 3. Annual price — $890 AUD ───

const annual = await stripe.prices.create({
  product: product.id,
  unit_amount: 89000,
  currency: "aud",
  recurring: { interval: "year" },
  nickname: "Annual",
  metadata: { plan: "self_serve_annual" },
});
console.log(`✓ Annual price:   ${annual.id}  ($890.00 AUD/yr)`);

// ─── 4. Webhook endpoint ───

const webhook = await stripe.webhookEndpoints.create({
  url: `${baseUrl}/api/webhooks/stripe`,
  enabled_events: [
    "checkout.session.completed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
  ],
  description: "Cove production webhook",
});
console.log(`✓ Webhook:        ${webhook.id}  (${webhook.url})`);

// ─── 5. Billing portal configuration ───
// Allows customers to manage/cancel their own subscription

await stripe.billingPortal.configurations.create({
  business_profile: {
    headline: "Manage your Cove subscription",
    privacy_policy_url: `${baseUrl}/privacy`,
    terms_of_service_url: `${baseUrl}/terms`,
  },
  features: {
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
    },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "always_invoice",
      products: [
        {
          product: product.id,
          prices: [monthly.id, annual.id],
        },
      ],
    },
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
  },
});
console.log(`✓ Billing portal configured`);

// ─── Output ───

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Add these to Vercel → Settings → Environment Variables
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STRIPE_SECRET_KEY=${key}
STRIPE_PRICE_ID=${monthly.id}
STRIPE_PRICE_ID_ANNUAL=${annual.id}
STRIPE_WEBHOOK_SECRET=${webhook.secret}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Save STRIPE_WEBHOOK_SECRET now — Stripe won't show it again.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
