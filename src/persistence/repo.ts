import { randomUUID } from "node:crypto";
import { ConflictError, NotFoundError } from "@/application/errors";
import type { FundingStatus, ObligationPurpose } from "@/domain/funding";
import type { FulfillmentState } from "@/domain/readiness";
import type { RevisionContent, RevisionStatus } from "@/domain/revision";
import type { CatalogEntry, Domain, RateCardEntry, TEMPLATES } from "@/domain/templates";
import { many, one, type Db, type Tx } from "./db";

export type JobRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  domain: Domain;
  title: string;
  currency: "USD";
  timezone: string;
  effective_revision_id: string | null;
  pending_revision_id: string | null;
  version: number;
  fulfillment_state: FulfillmentState;
  hold_reason: string | null;
  released_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
};

export type RevisionRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  number: number;
  status: RevisionStatus;
  predecessor_id: string | null;
  change_request_id: string | null;
  content: RevisionContent;
  content_hash: string;
  total_minor: number;
  created_by: string;
  created_at: Date;
  published_at: Date | null;
  decided_at: Date | null;
};

export type ObligationRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  revision_id: string;
  purpose: ObligationPurpose;
  amount_minor: number;
  currency: "USD";
  credited_before_minor: number;
  status: FundingStatus;
  checkout_generation: number;
  created_at: Date;
  updated_at: Date;
};

export type PaymentOperationRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  obligation_id: string;
  kind: "CREATE_ORDER" | "CAPTURE_ORDER";
  idempotency_key: string;
  payload_hash: string;
  status: "RESERVED" | "SUCCEEDED" | "UNKNOWN" | "FAILED";
  provider_order_id: string | null;
  provider_capture_id: string | null;
  approve_url: string | null;
  attempts: number;
  last_error: string | null;
  provider_debug_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CaptureRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  obligation_id: string;
  provider_order_id: string;
  provider_capture_id: string;
  amount_minor: number;
  currency: string;
  provider_status: string;
  credited: boolean;
  resolution: "CREDITED_TO_CURRENT" | "REFUND_REVIEW" | null;
  resolved_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export type RefundRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  capture_id: string;
  idempotency_key: string;
  amount_minor: number;
  currency: string;
  reason: string;
  reviewer_id: string;
  status: "RESERVED" | "UNKNOWN" | "PENDING" | "COMPLETED" | "FAILED";
  provider_refund_id: string | null;
  provider_status: string | null;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ChangeRequestRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  base_revision_id: string;
  source_ids: string[];
  status: "ANALYZING" | "NEEDS_REVIEW" | "NO_CHANGE" | "ACCEPTED" | "REJECTED";
  intent: string | null;
  proposal: unknown;
  validation_issues: string[];
  extractor: string | null;
  extractor_meta: unknown;
  draft_reply: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
};

export type MessageRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  author_label: string;
  author_role: "customer" | "merchant";
  sent_at_label: string | null;
  body: string;
  provenance: "user_supplied" | "portal_authenticated";
  content_hash: string;
  attachment_ids: string[];
  created_at: Date;
};

export const newId = () => randomUUID();

export async function lockJob(tx: Tx, tenantId: string, jobId: string): Promise<JobRow> {
  const job = await one<JobRow>(tx, "SELECT * FROM jobs WHERE tenant_id = $1 AND id = $2 FOR UPDATE", [tenantId, jobId]);
  if (!job) throw new NotFoundError("Job");
  return job;
}

export async function getJob(db: Db, tenantId: string, jobId: string): Promise<JobRow> {
  const job = await one<JobRow>(db, "SELECT * FROM jobs WHERE tenant_id = $1 AND id = $2", [tenantId, jobId]);
  if (!job) throw new NotFoundError("Job");
  return job;
}

/** Optimistic version check for merchant/customer mutations; the row lock makes it race-free. */
export function expectVersion(job: JobRow, expected: number | undefined): void {
  if (expected !== undefined && expected !== job.version) {
    throw new ConflictError("This job changed since you loaded it. Review the current version.", {
      currentVersion: job.version,
    });
  }
}

export async function updateJob(tx: Tx, job: JobRow, changes: Partial<Omit<JobRow, "id" | "tenant_id" | "version">>): Promise<JobRow> {
  const keys = Object.keys(changes) as (keyof typeof changes)[];
  const sets = keys.map((k, i) => `${k} = $${i + 3}`);
  sets.push("version = version + 1");
  const row = await one<JobRow>(
    tx,
    `UPDATE jobs SET ${sets.join(", ")} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    [job.tenant_id, job.id, ...keys.map((k) => changes[k])],
  );
  return row!;
}

export async function getRevision(db: Db, tenantId: string, id: string): Promise<RevisionRow> {
  const row = await one<RevisionRow>(db, "SELECT * FROM agreement_revisions WHERE tenant_id = $1 AND id = $2", [tenantId, id]);
  if (!row) throw new NotFoundError("Revision");
  return row;
}

export async function listRevisions(db: Db, tenantId: string, jobId: string): Promise<RevisionRow[]> {
  return many<RevisionRow>(db, "SELECT * FROM agreement_revisions WHERE tenant_id = $1 AND job_id = $2 ORDER BY number", [
    tenantId,
    jobId,
  ]);
}

export async function getObligation(db: Db, tenantId: string, id: string, lock = false): Promise<ObligationRow> {
  const row = await one<ObligationRow>(
    db,
    `SELECT * FROM payment_obligations WHERE tenant_id = $1 AND id = $2${lock ? " FOR UPDATE" : ""}`,
    [tenantId, id],
  );
  if (!row) throw new NotFoundError("Payment");
  return row;
}

export async function listObligations(db: Db, tenantId: string, jobId: string): Promise<ObligationRow[]> {
  return many<ObligationRow>(db, "SELECT * FROM payment_obligations WHERE tenant_id = $1 AND job_id = $2 ORDER BY created_at", [
    tenantId,
    jobId,
  ]);
}

export async function setObligationStatus(tx: Tx, o: ObligationRow, status: FundingStatus, extra: { amount_minor?: number } = {}) {
  await tx.query(
    `UPDATE payment_obligations SET status = $3, amount_minor = COALESCE($4, amount_minor), updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [o.tenant_id, o.id, status, extra.amount_minor ?? null],
  );
}

export async function listCaptures(db: Db, tenantId: string, jobId: string): Promise<CaptureRow[]> {
  return many<CaptureRow>(db, "SELECT * FROM captures WHERE tenant_id = $1 AND job_id = $2 ORDER BY created_at", [tenantId, jobId]);
}

export async function listRefunds(db: Db, tenantId: string, jobId: string): Promise<RefundRow[]> {
  return many<RefundRow>(db, "SELECT * FROM refund_operations WHERE tenant_id = $1 AND job_id = $2 ORDER BY created_at", [
    tenantId,
    jobId,
  ]);
}

export async function listOperations(db: Db, tenantId: string, jobId: string): Promise<PaymentOperationRow[]> {
  return many<PaymentOperationRow>(db, "SELECT * FROM payment_operations WHERE tenant_id = $1 AND job_id = $2 ORDER BY created_at", [
    tenantId,
    jobId,
  ]);
}

export type Catalog = { rateCard: RateCardEntry[]; artwork: CatalogEntry[] };

export async function loadCatalog(db: Db, tenantId: string, domain: Domain): Promise<Catalog> {
  const rows = await many<{ kind: string; code: string; label: string; unit_price_minor: number | null }>(
    db,
    "SELECT kind, code, label, unit_price_minor FROM catalog_items WHERE tenant_id = $1 AND domain = $2 ORDER BY kind, code",
    [tenantId, domain],
  );
  return {
    rateCard: rows
      .filter((r) => r.kind === "rate")
      .map((r) => ({ code: r.code, description: r.label, unitPriceMinor: r.unit_price_minor ?? 0 })),
    artwork: rows.filter((r) => r.kind === "artwork").map((r) => ({ id: r.code, label: r.label })),
  };
}

/** Artwork value prefix for a job's uploaded images, e.g. "att:<uuid>". */
export const ATTACHMENT_PREFIX = "att:";

/**
 * The merchant catalog plus images uploaded to this job, which become
 * selectable artwork for this job only.
 */
export async function loadJobCatalog(db: Db, job: { tenant_id: string; id: string; domain: Domain }): Promise<Catalog> {
  const base = await loadCatalog(db, job.tenant_id, job.domain);
  const files = await many<{ id: string; filename: string; uploaded_by_kind: string }>(
    db,
    "SELECT id, filename, uploaded_by_kind FROM attachments WHERE tenant_id = $1 AND job_id = $2 AND content_type LIKE 'image/%' ORDER BY created_at",
    [job.tenant_id, job.id],
  );
  return {
    ...base,
    artwork: [
      ...base.artwork,
      ...files.map((f) => ({ id: `${ATTACHMENT_PREFIX}${f.id}`, label: `${f.filename} (uploaded by ${f.uploaded_by_kind === "customer" ? "customer" : "business"})` })),
    ],
  };
}

export async function seedCatalog(tx: Tx, tenantId: string, templates: typeof TEMPLATES): Promise<void> {
  for (const t of Object.values(templates)) {
    for (const r of t.defaultRateCard) {
      await tx.query(
        `INSERT INTO catalog_items (tenant_id, domain, kind, code, label, unit_price_minor) VALUES ($1, $2, 'rate', $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [tenantId, t.domain, r.code, r.description, r.unitPriceMinor],
      );
    }
    for (const a of t.defaultCatalog.artwork) {
      await tx.query(
        `INSERT INTO catalog_items (tenant_id, domain, kind, code, label) VALUES ($1, $2, 'artwork', $3, $4) ON CONFLICT DO NOTHING`,
        [tenantId, t.domain, a.id, a.label],
      );
    }
  }
}

export async function audit(
  tx: Db,
  e: { tenantId: string; jobId: string | null; actorType: "merchant" | "customer" | "system" | "provider"; actorId: string | null; action: string; details?: Record<string, unknown> },
): Promise<void> {
  await tx.query(
    "INSERT INTO audit_events (tenant_id, job_id, actor_type, actor_id, action, details) VALUES ($1, $2, $3, $4, $5, $6)",
    [e.tenantId, e.jobId, e.actorType, e.actorId, e.action, JSON.stringify(e.details ?? {})],
  );
}

export async function enqueue(tx: Tx, tenantId: string | null, kind: string, payload: Record<string, unknown>): Promise<number> {
  const row = await one<{ id: string }>(tx, "INSERT INTO outbox (tenant_id, kind, payload) VALUES ($1, $2, $3) RETURNING id", [
    tenantId,
    kind,
    JSON.stringify(payload),
  ]);
  return Number(row!.id);
}
