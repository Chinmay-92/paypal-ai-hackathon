-- Pact initial schema. PostgreSQL is the authoritative store.
-- Every tenant-owned table carries tenant_id; application queries always filter by it.

CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  synthetic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'fulfillment')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE merchant_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_items (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  domain text NOT NULL CHECK (domain IN ('apparel', 'website')),
  kind text NOT NULL CHECK (kind IN ('rate', 'artwork')),
  code text NOT NULL,
  label text NOT NULL,
  unit_price_minor bigint CHECK (unit_price_minor IS NULL OR unit_price_minor >= 0),
  PRIMARY KEY (tenant_id, domain, kind, code)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  email text NOT NULL,
  synthetic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  domain text NOT NULL CHECK (domain IN ('apparel', 'website')),
  title text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD')),
  timezone text NOT NULL DEFAULT 'UTC',
  effective_revision_id uuid,
  pending_revision_id uuid,
  version integer NOT NULL DEFAULT 1,
  fulfillment_state text NOT NULL DEFAULT 'HOLD'
    CHECK (fulfillment_state IN ('HOLD', 'READY', 'IN_PROGRESS', 'COMPLETED', 'EXCEPTION')),
  hold_reason text,
  released_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_tenant_idx ON jobs (tenant_id, created_at DESC);

CREATE TABLE agreement_revisions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  number integer NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'CUSTOMER_APPROVED', 'DECLINED', 'SUPERSEDED')),
  predecessor_id uuid REFERENCES agreement_revisions(id),
  change_request_id uuid,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  decided_at timestamptz,
  UNIQUE (job_id, number)
);

ALTER TABLE jobs ADD CONSTRAINT jobs_effective_fk FOREIGN KEY (effective_revision_id) REFERENCES agreement_revisions(id);
ALTER TABLE jobs ADD CONSTRAINT jobs_pending_fk FOREIGN KEY (pending_revision_id) REFERENCES agreement_revisions(id);

-- Published revision content is immutable; only the lifecycle columns may change,
-- and only along permitted transitions.
CREATE FUNCTION enforce_revision_immutability() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
       NEW.content IS DISTINCT FROM OLD.content
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
    OR NEW.job_id IS DISTINCT FROM OLD.job_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.number IS DISTINCT FROM OLD.number
    OR NEW.predecessor_id IS DISTINCT FROM OLD.predecessor_id) THEN
    RAISE EXCEPTION 'published revision % is immutable', OLD.id;
  END IF;
  IF OLD.status <> 'DRAFT' AND NEW.status = 'DRAFT' THEN
    RAISE EXCEPTION 'revision % cannot return to draft', OLD.id;
  END IF;
  IF OLD.status IN ('DECLINED', 'SUPERSEDED') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'revision % is final (%)', OLD.id, OLD.status;
  END IF;
  IF OLD.status = 'CUSTOMER_APPROVED' AND NEW.status NOT IN ('CUSTOMER_APPROVED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'approved revision % can only be superseded', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agreement_revisions_immutable
  BEFORE UPDATE ON agreement_revisions
  FOR EACH ROW EXECUTE FUNCTION enforce_revision_immutability();

CREATE FUNCTION forbid_published_revision_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'published revision % cannot be deleted', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agreement_revisions_no_delete
  BEFORE DELETE ON agreement_revisions
  FOR EACH ROW EXECUTE FUNCTION forbid_published_revision_delete();

CREATE TABLE source_messages (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  author_label text NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('customer', 'merchant')),
  sent_at_label text,
  body text NOT NULL,
  provenance text NOT NULL CHECK (provenance IN ('user_supplied', 'portal_authenticated')),
  content_hash text NOT NULL,
  created_by_user uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_messages_job_idx ON source_messages (tenant_id, job_id, created_at);

CREATE TABLE change_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  base_revision_id uuid NOT NULL REFERENCES agreement_revisions(id),
  source_ids uuid[] NOT NULL,
  status text NOT NULL CHECK (status IN ('ANALYZING', 'NEEDS_REVIEW', 'NO_CHANGE', 'ACCEPTED', 'REJECTED')),
  intent text CHECK (intent IN ('question', 'change_request', 'cancellation', 'approval_like', 'irrelevant', 'uncertain')),
  proposal jsonb,
  validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  extractor text,
  extractor_meta jsonb,
  draft_reply text,
  review_note text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_requests_job_idx ON change_requests (tenant_id, job_id, created_at);

ALTER TABLE agreement_revisions ADD CONSTRAINT revisions_change_request_fk
  FOREIGN KEY (change_request_id) REFERENCES change_requests(id);

CREATE TABLE review_invitations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  revision_id uuid NOT NULL REFERENCES agreement_revisions(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_sessions (
  token_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  invitation_id uuid NOT NULL REFERENCES review_invitations(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE approvals (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  revision_id uuid NOT NULL UNIQUE REFERENCES agreement_revisions(id),
  content_hash text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  action text NOT NULL CHECK (action IN ('APPROVE', 'DECLINE')),
  auth_context jsonb NOT NULL,
  disclosed_terms jsonb NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_obligations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  revision_id uuid NOT NULL REFERENCES agreement_revisions(id),
  purpose text NOT NULL CHECK (purpose IN ('DEPOSIT', 'ADDITIONAL_DEPOSIT', 'BALANCE')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency IN ('USD')),
  credited_before_minor bigint NOT NULL CHECK (credited_before_minor >= 0),
  status text NOT NULL CHECK (status IN ('NOT_REQUIRED', 'DUE', 'PROCESSING', 'UNKNOWN', 'PENDING', 'COMPLETED',
    'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'REVIEW_REQUIRED', 'CANCELLED')),
  checkout_generation integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One obligation per revision and purpose.
  UNIQUE (revision_id, purpose)
);
CREATE INDEX payment_obligations_job_idx ON payment_obligations (tenant_id, job_id);

CREATE TABLE payment_operations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  obligation_id uuid NOT NULL REFERENCES payment_obligations(id),
  kind text NOT NULL CHECK (kind IN ('CREATE_ORDER', 'CAPTURE_ORDER')),
  idempotency_key text NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('RESERVED', 'SUCCEEDED', 'UNKNOWN', 'FAILED')),
  provider_order_id text,
  provider_capture_id text,
  approve_url text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  provider_debug_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_operations_obligation_idx ON payment_operations (obligation_id, created_at);
CREATE UNIQUE INDEX payment_operations_one_capture_per_order
  ON payment_operations (provider_order_id) WHERE kind = 'CAPTURE_ORDER' AND status <> 'FAILED';

CREATE TABLE captures (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  obligation_id uuid NOT NULL REFERENCES payment_obligations(id),
  provider_order_id text NOT NULL,
  provider_capture_id text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL,
  provider_status text NOT NULL,
  credited boolean NOT NULL,
  resolution text CHECK (resolution IN ('CREDITED_TO_CURRENT', 'REFUND_REVIEW')),
  resolved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refund_operations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  capture_id uuid NOT NULL REFERENCES captures(id),
  idempotency_key text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL,
  reason text NOT NULL,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('RESERVED', 'UNKNOWN', 'PENDING', 'COMPLETED', 'FAILED')),
  provider_refund_id text UNIQUE,
  provider_status text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_events (
  id uuid PRIMARY KEY,
  provider_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  resource_type text,
  resource_id text,
  tenant_id uuid REFERENCES tenants(id),
  status text NOT NULL CHECK (status IN ('RECEIVED', 'PROCESSED', 'UNMATCHED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid REFERENCES jobs(id),
  actor_type text NOT NULL CHECK (actor_type IN ('merchant', 'customer', 'system', 'provider')),
  actor_id text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_job_idx ON audit_events (tenant_id, job_id, id);

CREATE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

CREATE TABLE outbox (
  id bigserial PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'DEAD')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_due_idx ON outbox (next_attempt_at) WHERE status = 'PENDING';

-- At most one editable draft per job.
CREATE UNIQUE INDEX agreement_revisions_one_draft ON agreement_revisions (job_id) WHERE status = 'DRAFT';
-- At most one live checkout order per obligation and one live capture per order.
CREATE UNIQUE INDEX payment_operations_one_live_order
  ON payment_operations (obligation_id) WHERE kind = 'CREATE_ORDER' AND status <> 'FAILED';
