import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// 1. Create messages table
await sql`
  CREATE TABLE IF NOT EXISTS messages (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    direction   text        NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
    body        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  )
`;
await sql`
  CREATE INDEX IF NOT EXISTS idx_messages_lead_created
    ON messages (lead_id, created_at ASC)
`;
console.log('✅ messages table ready');

// 2. Delete Big Jims Plumbing business (cascades leads + messages)
const deleted = await sql`
  DELETE FROM businesses
  WHERE id = '865883de-465a-47b7-a7c7-6c57eb5baf02'
  RETURNING name, twilio_from_number
`;
if (deleted.length) {
  console.log(`✅ Deleted business: ${deleted[0].name} (${deleted[0].twilio_from_number})`);
} else {
  console.log('ℹ️  Business not found (may already be deleted)');
}

// 3. Show current state
const businesses = await sql`SELECT id, name, twilio_from_number, is_active, user_id FROM businesses ORDER BY created_at DESC LIMIT 10`;
console.log('\nCurrent businesses:');
console.table(businesses);
