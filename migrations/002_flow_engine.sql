-- Flow engine: add custom flow config and industry to businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS flow_config JSONB DEFAULT NULL;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry VARCHAR(100) DEFAULT NULL;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS operating_hours JSONB DEFAULT NULL;

-- Rate limiting for demo SMS
CREATE TABLE IF NOT EXISTS demo_rate_limits (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demo_rate_phone_time ON demo_rate_limits(phone, sent_at);

-- Integrations config per business (podium, servicetitan, etc.)
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS integrations JSONB DEFAULT NULL;
