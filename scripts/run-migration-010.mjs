import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS processed_messages (
    message_sid  text PRIMARY KEY,
    processed_at timestamptz NOT NULL DEFAULT now()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS rate_limits (
    id         bigserial PRIMARY KEY,
    bucket     text NOT NULL,
    key        text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits (bucket, key, created_at)`;

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_name IN ('processed_messages', 'rate_limits')
  ORDER BY table_name
`;
console.log('Migration 010 applied. Tables present:');
tables.forEach(t => console.log(' ', t.table_name));
