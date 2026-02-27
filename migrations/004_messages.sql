-- Run in Neon SQL Editor: https://console.neon.tech

CREATE TABLE IF NOT EXISTS messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction   text        NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_lead_created
  ON messages (lead_id, created_at ASC);
