-- Core loop + follow-ups (rebuild phases 2, 3 and 5).
-- Additive only: the release before this one keeps working against it.

-- ─── Businesses ───
-- The business row is created before its Twilio number is bought (and keeps
-- existing after the number is released). 001 declared this NOT NULL; the old
-- signup flow relied on it being nullable, so make that official.
ALTER TABLE businesses ALTER COLUMN twilio_from_number DROP NOT NULL;
-- settings: per-business switches and message overrides, e.g.
--   { "missed_call_alert": true, "urgent_only": false,
--     "followups": { "reminder": { "enabled": true, "body": "…" } } }
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Google Business Profile short link for review requests.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS review_link text;
-- Deactivation grace: the Twilio number is released after release_number_after.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS release_number_after timestamptz;
-- Last time the forwarding check alerted, so one quiet spell alerts once.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS forwarding_alerted_at timestamptz;

-- ─── Leads ───
-- Where the lead came from: missed_call | sms | webhook | api | test | rebook
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source text;
UPDATE leads SET source = 'missed_call' WHERE source IS NULL AND message = 'Missed call';
UPDATE leads SET source = 'test' WHERE source IS NULL AND message LIKE '[Test]%';

-- Exact timestamps for the monthly invoice report.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS booking_confirmed_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outcome_at timestamptz;
UPDATE leads SET outcome_at = updated_at WHERE outcome IS NOT NULL AND outcome_at IS NULL;

-- Owner can now decline a proposed booking.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_booking_status_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_booking_status_check
  CHECK (booking_status IS NULL OR booking_status IN ('proposed', 'confirmed', 'declined', 'none'));

CREATE INDEX IF NOT EXISTS idx_leads_business_created ON leads (business_id, created_at DESC);

-- ─── Opt-outs ───
-- STOP is per sender (per business) under the Spam Act; this table makes it
-- explicit and gives Kris one place to see every opt-out.
CREATE TABLE IF NOT EXISTS opt_outs (
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  phone       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, phone)
);
INSERT INTO opt_outs (business_id, phone, created_at)
  SELECT business_id, phone, MIN(COALESCE(finished_at, updated_at, created_at))
  FROM leads WHERE status = 'stopped'
  GROUP BY business_id, phone
ON CONFLICT DO NOTHING;

-- ─── Scheduled messages ───
-- One scheduler for every delayed text (nudges, reminders, review requests,
-- rebook nudges). /api/cron/dispatch sends what's due.
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lead_id      uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind         text        NOT NULL CHECK (kind IN ('reminder', 'review_request', 'rebook_nudge', 'unanswered_nudge')),
  send_at      timestamptz NOT NULL,
  sent_at      timestamptz,
  cancelled_at timestamptz,
  attempts     integer     NOT NULL DEFAULT 0,
  last_error   text,
  body         text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_due
  ON scheduled_messages (send_at) WHERE sent_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_lead ON scheduled_messages (lead_id);
