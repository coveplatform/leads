-- Strip the self-serve SaaS layer: Stripe billing, trials, Google OAuth,
-- password-reset tokens, instant quotes and the public demo.
-- The code stopped reading all of these in the same release, so run this only
-- AFTER that release is deployed (the previous release still selects them).
-- Everything removed is preserved in git on the saas-archive branch.

-- Billing / trial / OAuth / self-serve reset
ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE users DROP COLUMN IF EXISTS stripe_subscription_id;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE users DROP COLUMN IF EXISTS trial_started_at;
ALTER TABLE users DROP COLUMN IF EXISTS trial_emails_sent;
ALTER TABLE users DROP COLUMN IF EXISTS google_id;
ALTER TABLE users DROP COLUMN IF EXISTS password_reset_token;
ALTER TABLE users DROP COLUMN IF EXISTS password_reset_expires;

-- Instant quotes
ALTER TABLE leads DROP COLUMN IF EXISTS quote_low;
ALTER TABLE leads DROP COLUMN IF EXISTS quote_high;
UPDATE businesses SET flow_config = flow_config - 'quote_spec'
  WHERE flow_config IS NOT NULL AND flow_config ? 'quote_spec';

-- Public demo rate limiting
DROP TABLE IF EXISTS demo_rate_limits;
