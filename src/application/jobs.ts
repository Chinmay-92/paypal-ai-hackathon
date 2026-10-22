import type { z } from "zod";
import { amountDue, remainingBalance } from "@/domain/funding";
import { publishProblems } from "@/domain/revision";
import { template } from "@/domain/templates";
import { many, one, pool, withTx } from "@/persistence/db";
import {
  audit,
  getJob,
  listCaptures,
  listObligations,
  listOperations,
  listRefunds,
  listRevisions,
  loadJobCatalog,
  newId,
  type ChangeRequestRow,
  type JobRow,
  type MessageRow,
} from "@/persistence/repo";
import { requireOwner, type MerchantActor } from "./actors";
import { listAttachments } from "./attachments";
import { readiness } from "./ledger";
import { insertDraft } from "./revisions";
import type { CreateJobInput } from "./schemas";

/** Creates a job with its original agreement as a draft for the merchant to publish. */
export async function createJob(actor: MerchantActor, input: z.infer<typeof CreateJobInput>) {
  requireOwner(actor);
  return withTx(async (tx) => {
    const customerId = newId();
    await tx.query("INSERT INTO customers (id, tenant_id, name, email) VALUES ($1, $2, $3, $4)", [
      customerId,
      actor.tenantId,
      input.customer.name,
      input.customer.email,
    ]);
    const job = await one<JobRow>(
      tx,
      `INSERT INTO jobs (id, tenant_id, customer_id, domain, title, currency) VALUES ($1, $2, $3, $4, $5, 'USD') RETURNING *`,
      [newId(), actor.tenantId, customerId, input.domain, input.title],
    );
    const draft = await insertDraft(tx, job!, actor, input, { predecessorId: null, changeRequestId: null });
    await audit(tx, {
      tenantId: actor.tenantId,
      jobId: job!.id,
      actorType: "merchant",
      actorId: actor.userId,
      action: "job.created",
      details: { domain: input.domain, revisionId: draft.id },
    });
    return { job: job!, draft };
  });
}

export type JobListItem = {
  id: string;
  title: string;
  domain: string;
  customerName: string;
  fulfillmentState: string;
  currentRevision: number | null;
  pendingRevision: number | null;
  openRequests: number;
  dueMinor: number;
  unsettledPayments: number;
  reviewPayments: number;
  next: string;
  filter: "needs_review" | "awaiting_customer" | "awaiting_payment" | "ready" | "in_progress" | "exception" | "draft" | "completed";
};

export async function listJobs(actor: MerchantActor): Promise<JobListItem[]> {
  const rows = await many<
    JobRow & {
      customer_name: string;
      current_number: number | null;
      pending_number: number | null;
      open_requests: number;
      due_minor: number;
      unsettled: number;
      review: number;
    }
  >(
    pool(),
    `SELECT j.*, c.name AS customer_name, er.number AS current_number, pr.number AS pending_number,
       (SELECT count(*)::int FROM change_requests cr WHERE cr.job_id = j.id AND cr.status IN ('ANALYZING', 'NEEDS_REVIEW')) AS open_requests,
       (SELECT COALESCE(SUM(amount_minor), 0)::bigint FROM payment_obligations o WHERE o.job_id = j.id AND o.status IN ('DUE', 'PROCESSING', 'FAILED')) AS due_minor,
       (SELECT count(*)::int FROM payment_obligations o WHERE o.job_id = j.id AND o.status IN ('UNKNOWN', 'PENDING')) AS unsettled,
       (SELECT count(*)::int FROM payment_obligations o WHERE o.job_id = j.id AND o.status = 'REVIEW_REQUIRED') AS review
     FROM jobs j
     JOIN customers c ON c.id = j.customer_id AND c.tenant_id = j.tenant_id
     LEFT JOIN agreement_revisions er ON er.id = j.effective_revision_id
     LEFT JOIN agreement_revisions pr ON pr.id = j.pending_revision_id
     WHERE j.tenant_id = $1
     ORDER BY j.created_at DESC`,
    [actor.tenantId],
  );
  return rows.map((r) => {
    let filter: JobListItem["filter"];
    let next: string;
    if (r.fulfillment_state === "EXCEPTION") [filter, next] = ["exception", "Merchant: resolve late change"];
    else if (r.open_requests > 0 || r.review > 0) [filter, next] = ["needs_review", "Merchant: review request"];
    else if (r.pending_number !== null) [filter, next] = ["awaiting_customer", "Customer: approve or decline"];
    else if (r.unsettled > 0) [filter, next] = ["awaiting_payment", "System: confirming payment"];
    else if (r.due_minor > 0) [filter, next] = ["awaiting_payment", "Customer: pay deposit"];
    else if (r.current_number === null) [filter, next] = ["draft", "Merchant: publish agreement"];
    else if (r.fulfillment_state === "READY") [filter, next] = ["ready", "Team: start work"];
    else if (r.fulfillment_state === "IN_PROGRESS") [filter, next] = ["in_progress", "Team: complete work"];
    else if (r.fulfillment_state === "COMPLETED") [filter, next] = ["completed", "None"];
    else [filter, next] = ["needs_review", "Merchant: release work"];
    return {
      id: r.id,
      title: r.title,
      domain: r.domain,
      customerName: r.customer_name,
      fulfillmentState: r.fulfillment_state,
      currentRevision: r.current_number,
      pendingRevision: r.pending_number,
      openRequests: r.open_requests,
      dueMinor: r.due_minor,
      unsettledPayments: r.unsettled,
      reviewPayments: r.review,
      next,
      filter,
    };
  });
}

/** Everything the merchant workspace shows for one job. Tenant-scoped. */
export async function merchantJobView(actor: MerchantActor, jobId: string) {
  const db = pool();
  const job = await getJob(db, actor.tenantId, jobId);
  const [customer, revisions, messages, changeRequests, obligations, operations, captures, refunds, events, catalog] = await Promise.all([
    one<{ id: string; name: string; email: string; synthetic: boolean }>(db, "SELECT id, name, email, synthetic FROM customers WHERE tenant_id = $1 AND id = $2", [
      actor.tenantId,
      job.customer_id,
    ]),
    listRevisions(db, actor.tenantId, jobId),
    many<MessageRow>(db, "SELECT * FROM source_messages WHERE tenant_id = $1 AND job_id = $2 ORDER BY created_at", [actor.tenantId, jobId]),
    many<ChangeRequestRow>(db, "SELECT * FROM change_requests WHERE tenant_id = $1 AND job_id = $2 ORDER BY created_at DESC", [actor.tenantId, jobId]),
    listObligations(db, actor.tenantId, jobId),
    listOperations(db, actor.tenantId, jobId),
    listCaptures(db, actor.tenantId, jobId),
    listRefunds(db, actor.tenantId, jobId),
    many<{ id: number; actor_type: string; actor_id: string | null; action: string; details: Record<string, unknown>; created_at: Date }>(
      db,
      "SELECT id, actor_type, actor_id, action, details, created_at FROM audit_events WHERE tenant_id = $1 AND job_id = $2 ORDER BY id",
      [actor.tenantId, jobId],
    ),
    loadJobCatalog(db, job),
  ]);
  const attachments = await listAttachments(actor.tenantId, jobId);
  const effective = revisions.find((r) => r.id === job.effective_revision_id) ?? null;
  const pending = revisions.find((r) => r.id === job.pending_revision_id) ?? null;
  const draft = revisions.find((r) => r.status === "DRAFT") ?? null;
  const ready = await readiness(db, job, effective);
  return {
    job,
    customer: customer!,
    template: template(job.domain),
    catalog,
    revisions,
    effective,
    pending,
    draft,
    draftProblems: draft ? publishProblems(draft.content, catalog) : [],
    messages,
    attachments,
    changeRequests,
    obligations,
    operations,
    captures,
    refunds,
    events,
    readiness: ready,
    funding: {
      creditedMinor: ready.creditedMinor,
      depositTargetMinor: ready.depositTargetMinor,
      depositDueMinor: amountDue(ready.depositTargetMinor, ready.creditedMinor),
      remainingMinor: remainingBalance(ready.totalMinor, ready.creditedMinor),
    },
  };
}

export type MerchantJobView = Awaited<ReturnType<typeof merchantJobView>>;
