ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS forwarding_verified BOOLEAN NOT NULL DEFAULT false;
