-- Heartbeat: timestamp of the most recent real (forwarded) inbound call.
-- Lets the dashboard prove forwarding is still working, not just that it
-- worked once. Updated on every /api/voice/inbound hit.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS last_inbound_call_at timestamptz;

-- Default job value, used to estimate recovered revenue on the dashboard
-- scoreboard before per-lead outcomes are recorded.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS avg_job_value numeric;

-- Lead outcome tracking for ROI proof. NULL = pending, 'won' / 'lost' once
-- the owner marks it. job_value is the actual booked value when known.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS outcome text;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS job_value numeric;
