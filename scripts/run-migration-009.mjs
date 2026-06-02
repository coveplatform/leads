import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Each DDL statement is idempotent so this script is safe to re-run.
await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS appointment_at timestamptz`;
await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS booking_status text`;
await sql`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'leads_booking_status_check'
    ) THEN
      ALTER TABLE leads
        ADD CONSTRAINT leads_booking_status_check
        CHECK (booking_status IS NULL OR booking_status IN ('proposed', 'confirmed', 'none'));
    END IF;
  END $$;
`;
await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_low  numeric`;
await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_high numeric`;
await sql`CREATE INDEX IF NOT EXISTS idx_leads_business_appointment ON leads (business_id, appointment_at)`;

const cols = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'leads'
    AND column_name IN ('appointment_at', 'booking_status', 'quote_low', 'quote_high')
  ORDER BY column_name
`;
console.log('Migration 009 applied. New lead columns present:');
cols.forEach(c => console.log(' ', `leads.${c.column_name} (${c.data_type})`));
