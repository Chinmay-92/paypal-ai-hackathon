import { buildContent, contentHash, publishProblems, type RevisionContent } from "@/domain/revision";
import { checkFieldValue, template, type LineItem, type Scope } from "@/domain/templates";
import { many, one, withTx, type Tx } from "@/persistence/db";
import {
  audit,
  expectVersion,
  getRevision,
  loadCatalog,
  lockJob,
  newId,
  updateJob,
  type JobRow,
  type RevisionRow,
} from "@/persistence/repo";
import { requireOwner, type MerchantActor } from "./actors";
import { ConflictError, NotFoundError, UnprocessableError } from "./errors";
import { newToken } from "./tokens";

export const INVITATION_TTL_MS = 14 * 24 * 3600 * 1000;

export type DraftInput = {
  scope: Scope;
  lineItems: LineItem[];
  depositBps: number;
  merchantNote?: string;
};

async function assertFieldTypes(tx: Tx, job: JobRow, scope: Scope): Promise<void> {
  const catalog = await loadCatalog(tx, job.tenant_id, job.domain);
  const t = template(job.domain);
  const errors: string[] = [];
  for (const key of Object.keys(scope)) {
    const def = t.fields.find((f) => f.path === key);
    if (!def) errors.push(`Unknown field ${key}`);
    else {
      const err = checkFieldValue(def, scope[key], catalog);
      if (err) errors.push(err);
    }
  }
  if (errors.length) throw new UnprocessableError("The proposed scope is invalid", { problems: errors });
}

/** Creates the job's single editable draft. Content is immutable once published. */
export async function insertDraft(
  tx: Tx,
  job: JobRow,
  actor: MerchantActor,
  input: DraftInput,
  links: { predecessorId: string | null; changeRequestId: string | null },
): Promise<RevisionRow> {
  const existing = await one<{ id: string }>(tx, "SELECT id FROM agreement_revisions WHERE tenant_id = $1 AND job_id = $2 AND status = 'DRAFT'", [
    job.tenant_id,
    job.id,
  ]);
  if (existing) throw new ConflictError("This job already has a draft revision. Publish or discard it first.");
  await assertFieldTypes(tx, job, input.scope);
  const content = buildContent({ domain: job.domain, currency: job.currency, ...input });
  const next = await one<{ n: number }>(tx, "SELECT COALESCE(MAX(number), 0) + 1 AS n FROM agreement_revisions WHERE job_id = $1", [job.id]);
  const row = await one<RevisionRow>(
    tx,
    `INSERT INTO agreement_revisions (id, tenant_id, job_id, number, status, predecessor_id, change_request_id, content, content_hash, total_minor, created_by)
     VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10) RETURNING *`,
    [newId(), job.tenant_id, job.id, next!.n, links.predecessorId, links.changeRequestId, JSON.stringify(content), contentHash(content), content.totalMinor, actor.userId],
  );
  await audit(tx, {
    tenantId: job.tenant_id,
    jobId: job.id,
    actorType: "merchant",
    actorId: actor.userId,
    action: "revision.draft_created",
    details: { revisionId: row!.id, number: row!.number, changeRequestId: links.changeRequestId, totalMinor: content.totalMinor },
  });
  return row!;
}

/** Model-outage path: the merchant authors an amendment directly, with the same publish and payment safeguards. */
export async function createManualDraft(actor: MerchantActor, jobId: string, input: DraftInput & { expectedVersion: number }) {
  requireOwner(actor);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    expectVersion(job, input.expectedVersion);
    const base = job.effective_revision_id ?? job.pending_revision_id;
    const draft = await insertDraft(tx, job, actor, input, { predecessorId: base, changeRequestId: null });
    await updateJob(tx, job, {});
    return draft;
  });
}

export async function discardDraft(actor: MerchantActor, jobId: string, revisionId: string, expectedVersion: number) {
  requireOwner(actor);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    expectVersion(job, expectedVersion);
    const rev = await getRevision(tx, actor.tenantId, revisionId);
    if (rev.job_id !== job.id) throw new NotFoundError("Revision");
    if (rev.status !== "DRAFT") throw new ConflictError("Only a draft can be discarded");
    await tx.query("UPDATE change_requests SET status = 'NEEDS_REVIEW', reviewed_at = NULL, reviewed_by = NULL WHERE id = $1 AND status = 'ACCEPTED'", [
      rev.change_request_id,
    ]);
    await tx.query("DELETE FROM agreement_revisions WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT'", [actor.tenantId, rev.id]);
    await audit(tx, {
      tenantId: job.tenant_id,
      jobId: job.id,
      actorType: "merchant",
      actorId: actor.userId,
      action: "revision.draft_discarded",
      details: { revisionId: rev.id, number: rev.number },
    });
    await updateJob(tx, job, {});
  });
}

export async function issueInvitation(tx: Tx, job: JobRow, revisionId: string): Promise<string> {
  const token = newToken();
  await tx.query(
    `INSERT INTO review_invitations (id, tenant_id, job_id, revision_id, customer_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [newId(), job.tenant_id, job.id, revisionId, job.customer_id, token.hash, new Date(Date.now() + INVITATION_TTL_MS)],
  );
  return token.raw;
}

/**
 * Publishes the draft as the proposal the customer will review. Supersedes any
 * earlier unanswered proposal and revokes its review links; historical approvals stay.
 */
export async function publishRevision(
  actor: MerchantActor,
  jobId: string,
  revisionId: string,
  input: { expectedVersion: number; confirmFeasibility?: boolean },
): Promise<{ revision: RevisionRow; invitationToken: string }> {
  requireOwner(actor);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    expectVersion(job, input.expectedVersion);
    const rev = await getRevision(tx, actor.tenantId, revisionId);
    if (rev.job_id !== job.id) throw new NotFoundError("Revision");
    if (rev.status !== "DRAFT") throw new ConflictError("This revision is already published");
    const base = job.effective_revision_id ?? job.pending_revision_id;
    if (rev.predecessor_id !== base) {
      throw new ConflictError("The agreement changed after this draft was created. Discard it and review the current version.");
    }
    const catalog = await loadCatalog(tx, job.tenant_id, job.domain);
    const problems = publishProblems(rev.content, catalog);
    if (problems.length) throw new UnprocessableError("Resolve these items before publishing", { problems });
    if (job.started_at && !input.confirmFeasibility) {
      throw new ConflictError("Work has started. Confirm the shop can make this change before publishing it.");
    }
    if (job.fulfillment_state === "COMPLETED") throw new ConflictError("This job is completed");

    if (job.pending_revision_id) {
      await tx.query("UPDATE agreement_revisions SET status = 'SUPERSEDED', decided_at = now() WHERE id = $1", [job.pending_revision_id]);
      await tx.query("UPDATE review_invitations SET revoked_at = now() WHERE revision_id = $1 AND revoked_at IS NULL", [
        job.pending_revision_id,
      ]);
      await audit(tx, {
        tenantId: job.tenant_id,
        jobId: job.id,
        actorType: "merchant",
        actorId: actor.userId,
        action: "revision.superseded",
        details: { revisionId: job.pending_revision_id, by: rev.id },
      });
    }
    const published = await one<RevisionRow>(
      tx,
      "UPDATE agreement_revisions SET status = 'PUBLISHED', published_at = now() WHERE id = $1 RETURNING *",
      [rev.id],
    );
    const invitationToken = await issueInvitation(tx, job, rev.id);
    await updateJob(tx, job, {
      pending_revision_id: rev.id,
      fulfillment_state: job.started_at ? "EXCEPTION" : job.fulfillment_state === "READY" ? "HOLD" : job.fulfillment_state,
    });
    await audit(tx, {
      tenantId: job.tenant_id,
      jobId: job.id,
      actorType: "merchant",
      actorId: actor.userId,
      action: "revision.published",
      details: { revisionId: rev.id, number: rev.number, contentHash: rev.content_hash, totalMinor: rev.total_minor, feasibilityConfirmed: !!input.confirmFeasibility },
    });
    return { revision: published!, invitationToken };
  });
}

/** A fresh review link for the current proposal, e.g. if the customer lost it. Earlier links keep working until expiry. */
export async function reissueInvitation(actor: MerchantActor, jobId: string): Promise<string> {
  requireOwner(actor);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    const target = job.pending_revision_id ?? job.effective_revision_id;
    if (!target) throw new ConflictError("Publish the agreement before inviting the customer");
    const token = await issueInvitation(tx, job, target);
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "merchant", actorId: actor.userId, action: "invitation.issued", details: { revisionId: target } });
    return token;
  });
}

export async function revisionChain(tx: Tx, tenantId: string, jobId: string): Promise<RevisionContent[]> {
  const rows = await many<RevisionRow>(tx, "SELECT * FROM agreement_revisions WHERE tenant_id = $1 AND job_id = $2 ORDER BY number", [tenantId, jobId]);
  return rows.map((r) => r.content);
}
