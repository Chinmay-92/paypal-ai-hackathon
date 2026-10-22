import { formatScopeValue } from "@/domain/revision";
import { template } from "@/domain/templates";
import { pool, withTx } from "@/persistence/db";
import { audit, expectVersion, getJob, getRevision, lockJob, updateJob } from "@/persistence/repo";
import { requireOwner, type MerchantActor } from "./actors";
import { ConflictError } from "./errors";
import { readiness } from "./ledger";

/**
 * Merchant releases work only when nothing blocks it: current approved
 * revision, verified deposit, no unresolved amendment, payment or hold.
 */
export async function releaseWork(actor: MerchantActor, jobId: string, expectedVersion: number) {
  requireOwner(actor);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    expectVersion(job, expectedVersion);
    if (!["HOLD", "EXCEPTION"].includes(job.fulfillment_state)) throw new ConflictError(`Work is already ${job.fulfillment_state.toLowerCase().replace("_", " ")}`);
    const ready = await readiness(tx, { ...job, fulfillment_state: "HOLD" });
    if (ready.blockers.length) throw new ConflictError("Work cannot be released yet", { blockers: ready.blockers });
    // A job that already started resumes with the newly approved instructions.
    const next = job.started_at ? "IN_PROGRESS" : "READY";
    await updateJob(tx, job, { fulfillment_state: next, released_at: new Date() });
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "merchant", actorId: actor.userId, action: "fulfillment.released", details: { revisionId: job.effective_revision_id, state: next } });
    return next;
  });
}

export async function startWork(actor: MerchantActor, jobId: string, expectedVersion: number) {
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    expectVersion(job, expectedVersion);
    if (job.fulfillment_state !== "READY") throw new ConflictError("Only released work can be started");
    await updateJob(tx, job, { fulfillment_state: "IN_PROGRESS", started_at: job.started_at ?? new Date() });
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "merchant", actorId: actor.userId, action: "fulfillment.started", details: { revisionId: job.effective_revision_id } });
  });
}

export async function completeWork(actor: MerchantActor, jobId: string, expectedVersion: number) {
  requireOwner(actor);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    expectVersion(job, expectedVersion);
    if (job.fulfillment_state !== "IN_PROGRESS") throw new ConflictError("Only work in progress can be completed");
    await updateJob(tx, job, { fulfillment_state: "COMPLETED", completed_at: new Date() });
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "merchant", actorId: actor.userId, action: "fulfillment.completed", details: { revisionId: job.effective_revision_id } });
  });
}

export async function setHold(actor: MerchantActor, jobId: string, expectedVersion: number, reason: string | null) {
  requireOwner(actor);
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, jobId);
    expectVersion(job, expectedVersion);
    await updateJob(tx, job, {
      hold_reason: reason,
      fulfillment_state: reason && job.fulfillment_state === "READY" ? "HOLD" : job.fulfillment_state,
    });
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "merchant", actorId: actor.userId, action: reason ? "fulfillment.hold_placed" : "fulfillment.hold_cleared", details: { reason } });
  });
}

/** The current authorized job sheet. Contains no payment credentials or customer contact details. */
export async function fulfillmentSheet(actor: MerchantActor, jobId: string) {
  const db = pool();
  const job = await getJob(db, actor.tenantId, jobId);
  const effective = job.effective_revision_id ? await getRevision(db, actor.tenantId, job.effective_revision_id) : null;
  const ready = await readiness(db, job, effective);
  const t = template(job.domain);
  return {
    job: { id: job.id, title: job.title, domain: job.domain, state: job.fulfillment_state, version: job.version, releasedAt: job.released_at, startedAt: job.started_at, timezone: job.timezone },
    revision: effective ? { id: effective.id, number: effective.number, contentHash: effective.content_hash, approvedAt: effective.decided_at } : null,
    lines: effective ? t.fields.map((f) => ({ label: f.label, value: formatScopeValue(effective.content.scope[f.path] ?? null) })) : [],
    items: effective ? effective.content.lineItems.map((i) => ({ description: i.description, quantity: i.quantity })) : [],
    actionable: job.fulfillment_state === "READY" || job.fulfillment_state === "IN_PROGRESS",
    blockers: ready.blockers,
  };
}
