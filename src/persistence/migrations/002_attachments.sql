-- Private attachments. Stored in PostgreSQL for the prototype (no separate
-- object store yet); bytes and hash are immutable once written.

CREATE TABLE attachments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  message_id uuid REFERENCES source_messages(id),
  filename text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256 text NOT NULL,
  data bytea NOT NULL,
  uploaded_by_kind text NOT NULL CHECK (uploaded_by_kind IN ('merchant', 'customer')),
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_job_idx ON attachments (tenant_id, job_id, created_at);

CREATE FUNCTION enforce_attachment_immutability() RETURNS trigger AS $$
BEGIN
  IF NEW.data IS DISTINCT FROM OLD.data OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.content_type IS DISTINCT FROM OLD.content_type
     OR NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR (OLD.message_id IS NOT NULL AND NEW.message_id IS DISTINCT FROM OLD.message_id) THEN
    RAISE EXCEPTION 'attachment % is immutable', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attachments_immutable BEFORE UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION enforce_attachment_immutability();

ALTER TABLE source_messages ADD COLUMN attachment_ids uuid[] NOT NULL DEFAULT '{}';
