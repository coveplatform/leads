-- SaaS auth layer: users, subscriptions, link businesses to users

-- Users table
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
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

-- Link businesses to users (one user → one business for MVP)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);
