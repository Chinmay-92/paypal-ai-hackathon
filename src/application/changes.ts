import type { z } from "zod";
import { MATERIAL_INTENTS, type Intent, type Proposal } from "@/integrations/ai/contract";
import { extractProposal } from "@/integrations/ai/extract";
import { many, one, pool, withTx, type Tx } from "@/persistence/db";
import {
  audit,
  expectVersion,
  getRevision,
  loadCatalog,
  lockJob,
  newId,
  updateJob,
  type ChangeRequestRow,
  type JobRow,
  type MessageRow,
} from "@/persistence/repo";
import { auditActor, requireOwner, type CustomerActor, type MerchantActor, type SystemActor } from "./actors";
import { ConflictError, NotFoundError } from "./errors";
import { insertDraft } from "./revisions";
import type { AddMessageInput, ReviewChangeInput } from "./schemas";
import { sha256 } from "./tokens";

const CONTEXT_MESSAGES = 5;

/**
 * Stores a supplied message as untrusted source data and opens a change request
 * against the current agreement. Analysis runs from the outbox.
 */
export async function addMessage(
  actor: MerchantActor | CustomerActor,
  jobId: string,
  input: z.infer<typeof AddMessageInput>,
): Promise<{ messageId: string; changeRequestId: string }> {
  if (actor.kind === "merchant") requireOwner(actor);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    if (actor.kind === "customer" && actor.jobId !== job.id) throw new NotFoundError("Job");
    const base = job.effective_revision_id ?? job.pending_revision_id;
    if (!base) throw new ConflictError("Publish the original agreement before adding correspondence");
    const messageId = newId();
    const provenance = actor.kind === "customer" ? "portal_authenticated" : "user_supplied";
    await tx.query(
      `INSERT INTO source_messages (id, tenant_id, job_id, author_label, author_role, sent_at_label, body, provenance, content_hash, created_by_user)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        messageId,
        job.tenant_id,
        job.id,
        input.authorLabel,
        input.authorRole,
        input.sentAtLabel ?? null,
        input.body,
        provenance,
        sha256(input.body),
        actor.kind === "merchant" ? actor.userId : null,
      ],
    );
    const changeRequestId = newId();
    await tx.query(
      `INSERT INTO change_requests (id, tenant_id, job_id, base_revision_id, source_ids, status) VALUES ($1, $2, $3, $4, $5, 'ANALYZING')`,
      [changeRequestId, job.tenant_id, job.id, base, [messageId]],
    );
    await tx.query("INSERT INTO outbox (tenant_id, kind, payload) VALUES ($1, 'analyze_change_request', $2)", [
      job.tenant_id,
      JSON.stringify({ changeRequestId }),
    ]);
    const a = auditActor(actor);
    await audit(tx, {
      tenantId: job.tenant_id,
      jobId: job.id,
      ...a,
      action: "message.received",
      details: { messageId, provenance, authorRole: input.authorRole, changeRequestId },
    });
    await updateJob(tx, job, {});
    return { messageId, changeRequestId };
  });
}

function holdStateFor(job: JobRow): Partial<JobRow> {
  if (job.fulfillment_state === "IN_PROGRESS") return { fulfillment_state: "EXCEPTION" };
  if (job.fulfillment_state === "READY") return { fulfillment_state: "HOLD" };
  return {};
}

/**
 * Runs extraction outside any transaction, then stores the proposal. Model
 * output only ever becomes a proposal record; it never edits the agreement.
 */
export async function analyzeChangeRequest(actor: SystemActor, changeRequestId: string): Promise<ChangeRequestRow | null> {
  const db = pool();
  const cr = await one<ChangeRequestRow>(db, "SELECT * FROM change_requests WHERE tenant_id = $1 AND id = $2", [actor.tenantId, changeRequestId]);
  if (!cr) throw new NotFoundError("Change request");
  if (cr.status !== "ANALYZING") return cr;
  const job = await one<JobRow>(db, "SELECT * FROM jobs WHERE tenant_id = $1 AND id = $2", [actor.tenantId, cr.job_id]);
  const base = await getRevision(db, actor.tenantId, cr.base_revision_id);
  const catalog = await loadCatalog(db, actor.tenantId, job!.domain);
  const newest = await many<MessageRow>(db, "SELECT * FROM source_messages WHERE tenant_id = $1 AND id = ANY($2)", [actor.tenantId, cr.source_ids]);
  const context = await many<MessageRow>(
    db,
    `SELECT * FROM source_messages WHERE tenant_id = $1 AND job_id = $2 AND created_at < $3 AND NOT (id = ANY($4))
     ORDER BY created_at DESC LIMIT ${CONTEXT_MESSAGES}`,
    [actor.tenantId, cr.job_id, newest[0]?.created_at ?? new Date(), cr.source_ids],
  );
  const sources = [...context.reverse(), ...newest].map((m) => ({ id: m.id, authorLabel: m.author_label, authorRole: m.author_role, body: m.body }));
  const result = await extractProposal({ baseRevisionId: base.id, domain: job!.domain, scope: base.content.scope, catalog, sources });

  return withTx(async (tx) => {
    const locked = await lockJob(tx, actor.tenantId, cr.job_id);
    const current = await one<ChangeRequestRow>(tx, "SELECT * FROM change_requests WHERE id = $1 FOR UPDATE", [cr.id]);
    if (current!.status !== "ANALYZING") return current;
    const material = MATERIAL_INTENTS.includes(result.proposal.intent);
    const row = await one<ChangeRequestRow>(
      tx,
      `UPDATE change_requests SET status = $2, intent = $3, proposal = $4, validation_issues = $5, extractor = $6, extractor_meta = $7, draft_reply = $8
       WHERE id = $1 RETURNING *`,
      [
        cr.id,
        material ? "NEEDS_REVIEW" : "NO_CHANGE",
        result.proposal.intent,
        JSON.stringify(result.proposal),
        JSON.stringify(result.issues),
        result.extractor,
        JSON.stringify(result.meta),
        result.proposal.draftReply || null,
      ],
    );
    await audit(tx, {
      tenantId: locked.tenant_id,
      jobId: locked.id,
      actorType: "system",
      actorId: result.extractor,
      action: "change_request.analyzed",
      details: { changeRequestId: cr.id, intent: result.proposal.intent, issues: result.issues.length, material },
    });
    await updateJob(tx, locked, material ? holdStateFor(locked) : {});
    return row;
  });
}

async function lockChangeRequest(tx: Tx, actor: MerchantActor, jobId: string, crId: string): Promise<ChangeRequestRow> {
  const cr = await one<ChangeRequestRow>(tx, "SELECT * FROM change_requests WHERE tenant_id = $1 AND id = $2 AND job_id = $3 FOR UPDATE", [
    actor.tenantId,
    crId,
    jobId,
  ]);
  if (!cr) throw new NotFoundError("Change request");
  return cr;
}

async function openMaterialCount(tx: Tx, job: JobRow, excludeId: string): Promise<number> {
  const r = await one<{ n: number }>(
    tx,
    "SELECT count(*)::int AS n FROM change_requests WHERE job_id = $1 AND id <> $2 AND status IN ('ANALYZING', 'NEEDS_REVIEW')",
    [job.id, excludeId],
  );
  return r!.n;
}

/**
 * Merchant decision on a change request. Accept turns the merchant's final,
 * priced scope into a draft revision; reject records why; reopen moves a
 * message the model treated as non-material into review.
 */
export async function reviewChangeRequest(actor: MerchantActor, jobId: string, crId: string, input: z.infer<typeof ReviewChangeInput>) {
  requireOwner(actor);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    expectVersion(job, input.expectedVersion);
    const cr = await lockChangeRequest(tx, actor, jobId, crId);
    const base = job.effective_revision_id ?? job.pending_revision_id;

    if (input.decision === "reopen") {
      if (cr.status !== "NO_CHANGE") throw new ConflictError("Only a request marked as no change can be reopened");
      await tx.query("UPDATE change_requests SET status = 'NEEDS_REVIEW', review_note = $2 WHERE id = $1", [cr.id, input.note]);
      await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "merchant", actorId: actor.userId, action: "change_request.reopened", details: { changeRequestId: cr.id, note: input.note } });
      await updateJob(tx, job, holdStateFor(job));
      return { status: "NEEDS_REVIEW" as const };
    }

    if (cr.status !== "NEEDS_REVIEW") throw new ConflictError(`This request is ${cr.status.toLowerCase().replace("_", " ")}`);

    if (input.decision === "reject") {
      await tx.query("UPDATE change_requests SET status = 'REJECTED', review_note = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1", [
        cr.id,
        input.note,
        actor.userId,
      ]);
      await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "merchant", actorId: actor.userId, action: "change_request.rejected", details: { changeRequestId: cr.id, note: input.note } });
      // Rejecting the last late change after work started returns to the current agreement.
      const resume = job.fulfillment_state === "EXCEPTION" && !job.pending_revision_id && (await openMaterialCount(tx, job, cr.id)) === 0;
      await updateJob(tx, job, resume ? { fulfillment_state: "IN_PROGRESS" } : {});
      return { status: "REJECTED" as const };
    }

    if (cr.base_revision_id !== base) {
      throw new ConflictError("This request was analyzed against an earlier revision. Reject it or create a manual revision from the current agreement.", {
        baseRevisionId: cr.base_revision_id,
        currentRevisionId: base,
      });
    }
    if (job.started_at && !input.confirmFeasibility) {
      throw new ConflictError("Work has started. Confirm the shop can make this change before accepting it.");
    }
    const draft = await insertDraft(tx, job, actor, input, { predecessorId: base, changeRequestId: cr.id });
    await tx.query("UPDATE change_requests SET status = 'ACCEPTED', reviewed_by = $2, reviewed_at = now() WHERE id = $1", [cr.id, actor.userId]);
    await audit(tx, {
      tenantId: job.tenant_id,
      jobId: job.id,
      actorType: "merchant",
      actorId: actor.userId,
      action: "change_request.accepted",
      details: { changeRequestId: cr.id, revisionId: draft.id, feasibilityConfirmed: !!input.confirmFeasibility },
    });
    await updateJob(tx, job, {});
    return { status: "ACCEPTED" as const, draft };
  });
}

/** Pending analysis work from the outbox; used inline after intake and by the worker. */
export async function processAnalysisOutbox(limit = 10): Promise<number> {
  const db = pool();
  const due = await many<{ id: number; tenant_id: string; payload: { changeRequestId: string }; attempts: number }>(
    db,
    `SELECT id, tenant_id, payload, attempts FROM outbox WHERE kind = 'analyze_change_request' AND status = 'PENDING' AND next_attempt_at <= now()
     ORDER BY id LIMIT $1`,
    [limit],
  );
  let done = 0;
  for (const item of due) {
    // Claim by pushing next_attempt_at forward so concurrent workers skip it.
    const claimed = await db.query(
      "UPDATE outbox SET attempts = attempts + 1, next_attempt_at = now() + interval '2 minutes' WHERE id = $1 AND status = 'PENDING' AND attempts = $2",
      [item.id, item.attempts],
    );
    if (claimed.rowCount === 0) continue;
    try {
      await analyzeChangeRequest({ kind: "system", tenantId: item.tenant_id, reason: "analysis" }, item.payload.changeRequestId);
      await db.query("UPDATE outbox SET status = 'DONE' WHERE id = $1", [item.id]);
      done++;
    } catch (err) {
      const attempts = item.attempts + 1;
      await db.query(
        `UPDATE outbox SET last_error = $2, status = CASE WHEN $3 >= 5 THEN 'DEAD' ELSE 'PENDING' END,
           next_attempt_at = now() + make_interval(secs => $4) WHERE id = $1`,
        [item.id, err instanceof Error ? err.message.slice(0, 300) : "error", attempts, Math.min(600, 2 ** attempts * 5)],
      );
    }
  }
  return done;
}

export function proposalOf(cr: ChangeRequestRow): Proposal | null {
  return (cr.proposal as Proposal | null) ?? null;
}

export function isMaterial(intent: string | null): boolean {
  return intent !== null && MATERIAL_INTENTS.includes(intent as Intent);
}
