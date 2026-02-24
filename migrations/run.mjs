import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
config();

const sql = neon(process.env.DATABASE_URL);

console.log('Running migration 003...');

await sql`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255),
    subscription_status VARCHAR(50) DEFAULT 'inactive',
    onboarding_complete BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
console.log('✓ users table');

await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;
await sql`CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id)`;
console.log('✓ indexes');

await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)`;
await sql`CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id)`;
console.log('✓ businesses.user_id');

console.log('\nMigration complete.');
