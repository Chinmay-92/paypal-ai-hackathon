import type { z } from "zod";
import { amountDue, remainingBalance } from "@/domain/funding";
import { revisionDeposit, scopeDiff } from "@/domain/revision";
import { template } from "@/domain/templates";
import { many, one, pool, withTx, type Tx } from "@/persistence/db";
import {
  audit,
  getJob,
  getRevision,
  listObligations,
  loadJobCatalog,
  lockJob,
  newId,
  setObligationStatus,
  updateJob,
  type JobRow,
  type ObligationRow,
  type RevisionRow,
} from "@/persistence/repo";
import type { CustomerActor } from "./actors";
import { ConflictError, NotFoundError, UnauthenticatedError } from "./errors";
import { jobCredited } from "./ledger";
import type { DecisionInput } from "./schemas";
import { hashToken, newToken } from "./tokens";

export const CUSTOMER_SESSION_TTL_MS = 12 * 3600 * 1000;

type InvitationRow = {
  id: string;
  tenant_id: string;
  job_id: string;
  revision_id: string;
  customer_id: string;
  expires_at: Date;
  revoked_at: Date | null;
};

export type ExchangeResult =
  | { ok: true; sessionToken: string; jobId: string }
  | { ok: false; reason: "invalid" | "expired" | "replaced" };

/**
 * Exchanges a review link for a short job-scoped session. A link for a
 * replaced proposal does not open a session; the customer needs the current link.
 */
export async function exchangeInvitation(rawToken: string): Promise<ExchangeResult> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(rawToken)) return { ok: false, reason: "invalid" };
  return withTx(async (tx) => {
    const inv = await one<InvitationRow>(tx, "SELECT * FROM review_invitations WHERE token_hash = $1", [hashToken(rawToken)]);
    if (!inv) return { ok: false, reason: "invalid" } as const;
    if (inv.revoked_at) return { ok: false, reason: "replaced" } as const;
    if (inv.expires_at.getTime() < Date.now()) return { ok: false, reason: "expired" } as const;
    const session = newToken();
    await tx.query(
      `INSERT INTO customer_sessions (token_hash, tenant_id, job_id, customer_id, invitation_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [session.hash, inv.tenant_id, inv.job_id, inv.customer_id, inv.id, new Date(Date.now() + CUSTOMER_SESSION_TTL_MS)],
    );
    await audit(tx, { tenantId: inv.tenant_id, jobId: inv.job_id, actorType: "customer", actorId: inv.customer_id, action: "invitation.opened", details: { invitationId: inv.id, revisionId: inv.revision_id } });
    return { ok: true, sessionToken: session.raw, jobId: inv.job_id } as const;
  });
}

export async function customerFromSession(rawToken: string | undefined): Promise<CustomerActor> {
  if (!rawToken) throw new UnauthenticatedError("Open the review link the business sent you");
  const s = await one<{ tenant_id: string; job_id: string; customer_id: string; invitation_id: string; expires_at: Date }>(
    pool(),
    "SELECT tenant_id, job_id, customer_id, invitation_id, expires_at FROM customer_sessions WHERE token_hash = $1",
    [hashToken(rawToken)],
  );
  if (!s || s.expires_at.getTime() < Date.now()) throw new UnauthenticatedError("Your review session expired. Open the latest link from the business.");
  return { kind: "customer", tenantId: s.tenant_id, jobId: s.job_id, customerId: s.customer_id, invitationId: s.invitation_id };
}

export type DisclosedTerms = {
  revisionId: string;
  revisionNumber: number;
  contentHash: string;
  currency: string;
  totalMinor: number;
  depositTargetMinor: number;
  previouslyPaidMinor: number;
  dueNowMinor: number;
  remainingAfterDepositMinor: number;
  termsVersion: string;
};

export function disclose(rev: RevisionRow, creditedMinor: number): DisclosedTerms {
  const target = revisionDeposit(rev.content);
  const due = amountDue(target, creditedMinor);
  return {
    revisionId: rev.id,
    revisionNumber: rev.number,
    contentHash: rev.content_hash,
    currency: rev.content.currency,
    totalMinor: rev.total_minor,
    depositTargetMinor: target,
    previouslyPaidMinor: creditedMinor,
    dueNowMinor: due,
    remainingAfterDepositMinor: remainingBalance(rev.total_minor, creditedMinor + due),
    termsVersion: rev.content.terms.version,
  };
}

/** What the customer sees: merchant, the effective agreement, any proposal and its money effect. */
export async function portalView(actor: CustomerActor) {
  const db = pool();
  const job = await getJob(db, actor.tenantId, actor.jobId);
  const [tenant, customer, { credited }, obligations, decisions] = await Promise.all([
    one<{ name: string; synthetic: boolean }>(db, "SELECT name, synthetic FROM tenants WHERE id = $1", [actor.tenantId]),
    one<{ name: string }>(db, "SELECT name FROM customers WHERE tenant_id = $1 AND id = $2", [actor.tenantId, actor.customerId]),
    jobCredited(db, actor.tenantId, actor.jobId),
    listObligations(db, actor.tenantId, actor.jobId),
    many<{ revision_id: string; action: string; created_at: Date }>(
      db,
      "SELECT revision_id, action, created_at FROM approvals WHERE tenant_id = $1 AND job_id = $2 ORDER BY created_at",
      [actor.tenantId, actor.jobId],
    ),
  ]);
  const effective = job.effective_revision_id ? await getRevision(db, actor.tenantId, job.effective_revision_id) : null;
  const pending = job.pending_revision_id ? await getRevision(db, actor.tenantId, job.pending_revision_id) : null;
  const invitation = await one<{ revision_id: string; revoked_at: Date | null }>(db, "SELECT revision_id, revoked_at FROM review_invitations WHERE id = $1", [actor.invitationId]);
  const catalog = await loadJobCatalog(db, job);
  const payable = obligations.filter((o) => o.revision_id === job.effective_revision_id && ["DUE", "PROCESSING", "FAILED", "UNKNOWN", "PENDING"].includes(o.status));
  return {
    job: { id: job.id, title: job.title, domain: job.domain, version: job.version, fulfillmentState: job.fulfillment_state, currency: job.currency, timezone: job.timezone, startedAt: job.started_at },
    merchant: { name: tenant!.name, synthetic: tenant!.synthetic },
    customerName: customer!.name,
    template: template(job.domain),
    effective,
    pending,
    diff: pending ? scopeDiff(job.domain, effective?.content.scope ?? {}, pending.content.scope) : [],
    pendingTerms: pending ? disclose(pending, credited) : null,
    effectiveTerms: effective ? disclose(effective, credited) : null,
    creditedMinor: credited,
    obligations: payable,
    reviewPayments: obligations.filter((o) => o.status === "REVIEW_REQUIRED"),
    linkReplaced: invitation?.revoked_at !== null && invitation?.revision_id !== job.pending_revision_id,
    decisions,
    artworkLabels: Object.fromEntries(catalog.artwork.map((a) => [a.id, a.label])),
  };
}

async function cancelStaleObligations(tx: Tx, job: JobRow, keepRevisionId: string): Promise<void> {
  const open = await many<ObligationRow>(
    tx,
    "SELECT * FROM payment_obligations WHERE tenant_id = $1 AND job_id = $2 AND revision_id <> $3 AND status IN ('DUE', 'FAILED', 'PROCESSING') FOR UPDATE",
    [job.tenant_id, job.id, keepRevisionId],
  );
  for (const o of open) {
    // A checkout still open for the old revision may yet be paid; that payment then needs merchant review.
    await setObligationStatus(tx, o, "CANCELLED");
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "system", actorId: "approval", action: "obligation.cancelled", details: { obligationId: o.id, revisionId: o.revision_id, previous: o.status } });
  }
}

/** Creates the obligation for an approved revision, if the credited funding does not already cover its deposit. */
export async function ensureDepositObligation(tx: Tx, job: JobRow, rev: RevisionRow, creditedMinor: number): Promise<ObligationRow | null> {
  const due = amountDue(revisionDeposit(rev.content), creditedMinor);
  if (due <= 0) return null;
  const purpose = creditedMinor === 0 ? "DEPOSIT" : "ADDITIONAL_DEPOSIT";
  const row = await one<ObligationRow>(
    tx,
    `INSERT INTO payment_obligations (id, tenant_id, job_id, revision_id, purpose, amount_minor, currency, credited_before_minor, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DUE') ON CONFLICT (revision_id, purpose) DO NOTHING RETURNING *`,
    [newId(), job.tenant_id, job.id, rev.id, purpose, due, job.currency, creditedMinor],
  );
  if (row) {
    await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "system", actorId: "approval", action: "obligation.created", details: { obligationId: row.id, purpose, amountMinor: due, creditedBeforeMinor: creditedMinor } });
  }
  return row;
}

/**
 * Records the customer's decision on one exact revision and content hash.
 * Anything other than the current proposal is a 409: approvals never carry over.
 */
export async function decide(actor: CustomerActor, revisionId: string, input: z.infer<typeof DecisionInput>, context: { userAgent?: string; ip?: string } = {}) {
  return withTx(async (tx) => {
    const job = await lockJob(tx, actor.tenantId, actor.jobId);
    const rev = await one<RevisionRow>(tx, "SELECT * FROM agreement_revisions WHERE tenant_id = $1 AND job_id = $2 AND id = $3", [actor.tenantId, job.id, revisionId]);
    if (!rev) throw new NotFoundError("Revision");
    if (job.pending_revision_id !== rev.id || rev.status !== "PUBLISHED") {
      throw new ConflictError("This proposal has been replaced. Review the current version.", { currentRevisionId: job.pending_revision_id });
    }
    if (input.contentHash !== rev.content_hash) {
      throw new ConflictError("The terms you reviewed do not match this proposal. Reload and review again.");
    }
    const { credited } = await jobCredited(tx, job.tenant_id, job.id);
    const terms = disclose(rev, credited);
    await tx.query(
      `INSERT INTO approvals (id, tenant_id, job_id, revision_id, content_hash, customer_id, action, auth_context, disclosed_terms, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newId(),
        job.tenant_id,
        job.id,
        rev.id,
        rev.content_hash,
        actor.customerId,
        input.action,
        JSON.stringify({ method: "review_link_session", invitationId: actor.invitationId, userAgent: context.userAgent?.slice(0, 200) ?? null, ip: context.ip ?? null }),
        JSON.stringify(terms),
        input.reason ?? null,
      ],
    );

    if (input.action === "DECLINE") {
      await tx.query("UPDATE agreement_revisions SET status = 'DECLINED', decided_at = now() WHERE id = $1", [rev.id]);
      await tx.query("UPDATE review_invitations SET revoked_at = now() WHERE revision_id = $1 AND revoked_at IS NULL", [rev.id]);
      // The earlier agreement stays effective; the merchant resolves what happens next.
      await updateJob(tx, job, { pending_revision_id: null });
      await audit(tx, { tenantId: job.tenant_id, jobId: job.id, actorType: "customer", actorId: actor.customerId, action: "revision.declined", details: { revisionId: rev.id, reason: input.reason ?? null } });
      return { action: "DECLINE" as const, terms };
    }

    await tx.query("UPDATE agreement_revisions SET status = 'CUSTOMER_APPROVED', decided_at = now() WHERE id = $1", [rev.id]);
    if (job.effective_revision_id) {
      await tx.query("UPDATE agreement_revisions SET status = 'SUPERSEDED' WHERE id = $1 AND status = 'CUSTOMER_APPROVED'", [job.effective_revision_id]);
    }
    await cancelStaleObligations(tx, job, rev.id);
    const obligation = await ensureDepositObligation(tx, job, rev, credited);
    await updateJob(tx, job, {
      effective_revision_id: rev.id,
      pending_revision_id: null,
      fulfillment_state: job.fulfillment_state === "READY" ? "HOLD" : job.fulfillment_state,
    });
    await audit(tx, {
      tenantId: job.tenant_id,
      jobId: job.id,
      actorType: "customer",
      actorId: actor.customerId,
      action: "revision.approved",
      details: { revisionId: rev.id, number: rev.number, contentHash: rev.content_hash, dueNowMinor: terms.dueNowMinor, obligationId: obligation?.id ?? null },
    });
    return { action: "APPROVE" as const, terms, obligationId: obligation?.id ?? null };
  });
}
