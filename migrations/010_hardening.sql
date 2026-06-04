-- Hardening: inbound SMS idempotency + generic rate limiting.
-- Idempotent DDL — safe to re-run.

-- Dedup store for Twilio inbound webhooks. Twilio delivers at-least-once and
-- retries on slow/failed responses, so the same MessageSid can arrive twice.
-- Claiming the SID before processing prevents double-advancing a flow.
CREATE TABLE IF NOT EXISTS processed_messages (
  message_sid  text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Generic per-key rate limiting (auth endpoints keyed by IP, etc.).
CREATE TABLE IF NOT EXISTS rate_limits (
  id         bigserial PRIMARY KEY,
  bucket     text NOT NULL,
  key        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits (bucket, key, created_at);
