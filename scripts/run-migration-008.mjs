import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Each DDL statement is idempotent (ADD COLUMN IF NOT EXISTS) so this script
// is safe to re-run.
await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_inbound_call_at timestamptz`;
await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS avg_job_value numeric`;
await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS outcome text`;
await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS job_value numeric`;

const cols = await sql`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE (table_name = 'businesses' AND column_name IN ('last_inbound_call_at', 'avg_job_value'))
     OR (table_name = 'leads' AND column_name IN ('outcome', 'job_value'))
  ORDER BY table_name, column_name
`;
console.log('Migration 008 applied. New columns present:');
cols.forEach(c => console.log(' ', `${c.table_name}.${c.column_name} (${c.data_type})`));
