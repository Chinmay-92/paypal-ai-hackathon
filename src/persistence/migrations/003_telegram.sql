ALTER TABLE source_messages DROP CONSTRAINT source_messages_provenance_check;
ALTER TABLE source_messages ADD CONSTRAINT source_messages_provenance_check CHECK (provenance IN ('user_supplied', 'portal_authenticated', 'telegram'));

CREATE TABLE telegram_links (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  chat_id text,
  telegram_user_id text,
  connected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_links_chat_idx ON telegram_links (chat_id, telegram_user_id) WHERE revoked_at IS NULL;
CREATE TABLE telegram_updates (
  update_id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
