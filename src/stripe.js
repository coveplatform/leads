import Stripe from "stripe";
import { config } from "./config.js";

function getStripe() {
  if (!config.stripe.secretKey) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(config.stripe.secretKey);
}

export async function createStripeCustomer({ email, name }) {
  const stripe = getStripe();
  return stripe.customers.create({ email, name });
}

export async function createCheckoutSession({ customerId, successUrl, cancelUrl }) {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [
      {
        price: config.stripe.priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    subscription_data: {
      metadata: { source: "cove_self_serve" },
    },
  });
}

export async function createBillingPortalSession({ customerId, returnUrl }) {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export function constructWebhookEvent(payload, signature) {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret,
  );
}

export async function getSubscription(subscriptionId) {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId);
}

export function isStripeConfigured() {
  return Boolean(config.stripe.secretKey && config.stripe.priceId);
}
