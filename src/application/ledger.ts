import { creditedFunding, type LedgerCapture } from "@/domain/funding";
import { blockers, type Blocker } from "@/domain/readiness";
import { revisionDeposit } from "@/domain/revision";
import { many, type Db } from "@/persistence/db";
import { listCaptures, listObligations, listRefunds, type CaptureRow, type JobRow, type RevisionRow, getRevision } from "@/persistence/repo";

export function completedRefunds(refunds: { capture_id: string; status: string; amount_minor: number }[], captureId: string): number {
  return refunds.filter((r) => r.capture_id === captureId && r.status === "COMPLETED").reduce((s, r) => s + r.amount_minor, 0);
}

export function reservedRefunds(refunds: { capture_id: string; status: string; amount_minor: number }[], captureId: string): number {
  return refunds
    .filter((r) => r.capture_id === captureId && ["RESERVED", "UNKNOWN", "PENDING"].includes(r.status))
    .reduce((s, r) => s + r.amount_minor, 0);
}

export async function jobCredited(db: Db, tenantId: string, jobId: string): Promise<{ credited: number; captures: CaptureRow[] }> {
  // Sequential: db may be a transaction client, which runs one query at a time.
  const captures = await listCaptures(db, tenantId, jobId);
  const refunds = await listRefunds(db, tenantId, jobId);
  const ledger: LedgerCapture[] = captures.map((c) => ({
    amountMinor: c.amount_minor,
    providerStatus: c.provider_status,
    credited: c.credited,
    completedRefundsMinor: completedRefunds(refunds, c.id),
  }));
  return { credited: creditedFunding(ledger), captures };
}

export type Readiness = {
  blockers: Blocker[];
  creditedMinor: number;
  depositTargetMinor: number;
  totalMinor: number;
};

export async function readiness(db: Db, job: JobRow, effective?: RevisionRow | null): Promise<Readiness> {
  const eff =
    effective !== undefined ? effective : job.effective_revision_id ? await getRevision(db, job.tenant_id, job.effective_revision_id) : null;
  const { credited } = await jobCredited(db, job.tenant_id, job.id);
  const obligations = await listObligations(db, job.tenant_id, job.id);
  const openCrs = await many<{ n: number }>(
    db,
    "SELECT count(*)::int AS n FROM change_requests WHERE tenant_id = $1 AND job_id = $2 AND status IN ('ANALYZING', 'NEEDS_REVIEW')",
    [job.tenant_id, job.id],
  );
  const depositTargetMinor = eff ? revisionDeposit(eff.content) : 0;
  return {
    creditedMinor: credited,
    depositTargetMinor,
    totalMinor: eff?.total_minor ?? 0,
    blockers: blockers({
      fulfillmentState: job.fulfillment_state,
      hasApprovedEffectiveRevision: eff?.status === "CUSTOMER_APPROVED",
      hasPendingRevision: job.pending_revision_id !== null,
      openMaterialChangeRequests: openCrs[0]?.n ?? 0,
      depositTargetMinor,
      creditedMinor: credited,
      obligationStatuses: obligations.map((o) => o.status),
      holdReason: job.hold_reason,
    }),
  };
}
