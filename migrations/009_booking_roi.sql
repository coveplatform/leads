-- Booking + ROI: in-conversation appointment booking and the recovered-revenue
-- engine. Every statement is idempotent so this migration is safe to re-run.
-- Run in the Neon SQL Editor (https://console.neon.tech) or via
--   node scripts/run-migration-009.mjs

-- ─── Booking (the revenue hero) ───
-- The slot the caller picked inside the SMS conversation.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appointment_at timestamptz;

-- Booking lifecycle:
--   NULL        no booking
--   'proposed'  caller picked a slot, owner still confirms (MVP soft-book)
--   'confirmed' owner / calendar confirmed
--   'none'      caller declined a slot ("another time")
ALTER TABLE leads ADD COLUMN IF NOT EXISTS booking_status text;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_booking_status_check'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_booking_status_check
      CHECK (booking_status IS NULL OR booking_status IN ('proposed', 'confirmed', 'none'));
  END IF;
END $$;

-- ─── Instant quote (toggle / upsell) ───
-- The ballpark range shown to the caller. Always a range, never a point.
-- The quote *config* (quote_spec) lives in the existing flow_config JSONB — no
-- column needed for it here.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_low  numeric;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_high numeric;

-- Speeds up the ROI aggregate's "booked" filter.
CREATE INDEX IF NOT EXISTS idx_leads_business_appointment
  ON leads (business_id, appointment_at);
