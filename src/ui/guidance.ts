import type { MerchantJobView } from "@/application/jobs";
import { label, money } from "./format";

// Turns a job's state into the lifecycle track and the single next step the
// merchant should see. Pure presentation logic over the authoritative view.

export type Tab = "changes" | "conversation" | "payments" | "agreement";

export type TrackStep = { key: string; label: string; state: "done" | "current" | "upcoming"; note?: string };

export type NextStep = {
  tone: "action" | "waiting" | "done" | "alert";
  who: string;
  title: string;
  detail: string;
  tab: Tab;
  action:
    | { kind: "tab"; label: string }
    | { kind: "release" | "start" | "complete" | "balance" | "reissue" | "reconcile" | "clearHold"; label: string; obligationId?: string }
    | null;
};

export function track(v: MerchantJobView): TrackStep[] {
  const published = v.effective !== null || v.pending !== null;
  const approved = v.effective !== null;
  const funded = approved && v.funding.depositDueMinor === 0 && v.funding.creditedMinor >= v.funding.depositTargetMinor;
  const state = v.job.fulfillment_state;
  const released = v.job.released_at !== null && ["READY", "IN_PROGRESS", "COMPLETED"].includes(state);
  const started = v.job.started_at !== null;
  const done = state === "COMPLETED";
  const flags = [published, approved && !v.pending, funded && !v.pending, released, started, done];
  const firstOpen = flags.findIndex((f) => !f);
  const steps: TrackStep[] = [
    { key: "agreement", label: "Agreement sent", state: "upcoming", note: v.pending ? `R${v.pending.number} proposed` : v.effective ? `R${v.effective.number}` : v.draft ? "Draft" : undefined },
    { key: "approved", label: "Customer approved", state: "upcoming", note: v.pending && v.effective ? "New revision waiting" : undefined },
    { key: "deposit", label: "Deposit paid", state: "upcoming", note: approved ? `${money(v.funding.creditedMinor)} of ${money(v.funding.depositTargetMinor)}` : undefined },
    { key: "released", label: "Work released", state: "upcoming" },
    { key: "production", label: "In production", state: "upcoming", note: state === "EXCEPTION" ? "Late change" : undefined },
    { key: "done", label: "Completed", state: "upcoming" },
  ];
  return steps.map((s, i) => ({ ...s, state: firstOpen === -1 || i < firstOpen ? "done" : i === firstOpen ? "current" : "upcoming" }));
}

export function nextStep(v: MerchantJobView): NextStep {
  const customer = v.customer.name.replace(/\s*\(synthetic\)/, "");
  const open = v.changeRequests.filter((c) => c.status === "NEEDS_REVIEW");
  const analyzing = v.changeRequests.some((c) => c.status === "ANALYZING");
  const review = v.obligations.find((o) => o.status === "REVIEW_REQUIRED");
  const unsettled = v.obligations.find((o) => o.status === "UNKNOWN" || o.status === "PENDING");
  const due = v.obligations.find((o) => ["DUE", "PROCESSING", "FAILED"].includes(o.status) && o.revision_id === v.job.effective_revision_id);
  const state = v.job.fulfillment_state;

  if (analyzing) return { tone: "waiting", who: "Pact", title: "Reading the new message", detail: "A proposal will appear in a moment. The job is held until you review it.", tab: "changes", action: { kind: "tab", label: "Open changes" } };
  if (open.length && state === "EXCEPTION")
    return { tone: "alert", who: "You", title: "Work has started. Decide on the late change", detail: "Accept it only if the shop can still make it; otherwise reject it with a reason and work continues as agreed.", tab: "changes", action: { kind: "tab", label: "Review the change" } };
  if (open.length)
    return { tone: "action", who: "You", title: `Review ${customer}'s change request`, detail: "Check the proposed changes against the quotes, fill in anything missing and set the price.", tab: "changes", action: { kind: "tab", label: "Review the change" } };
  if (v.draft) {
    const original = !v.effective && !v.pending;
    return v.draftProblems.length
      ? { tone: "action", who: "You", title: `Finish draft R${v.draft.number}`, detail: v.draftProblems[0], tab: "changes", action: { kind: "tab", label: "Open the draft" } }
      : { tone: "action", who: "You", title: original ? "Send the agreement to your customer" : `Publish revision R${v.draft.number}`, detail: `Publishing creates a review link for ${customer}. Nothing is sent automatically.`, tab: "changes", action: { kind: "tab", label: "Review and publish" } };
  }
  if (review) return { tone: "alert", who: "You", title: "Decide what to do with a payment", detail: "Money arrived for a proposal that was replaced. Credit it to the current agreement or plan a refund.", tab: "payments", action: { kind: "tab", label: "Open payments" } };
  if (v.pending)
    return { tone: "waiting", who: customer, title: `Waiting for ${customer} to approve R${v.pending.number}`, detail: "They review the exact changes and price on their phone. Need to resend the link?", tab: "changes", action: { kind: "reissue", label: "Get a new review link" } };
  if (unsettled)
    return { tone: "waiting", who: "PayPal", title: unsettled.status === "PENDING" ? "Payment is pending at PayPal" : "Confirming a payment with PayPal", detail: "Work stays on hold until PayPal confirms. The customer should not pay again.", tab: "payments", action: { kind: "reconcile", label: "Check payment status", obligationId: unsettled.id } };
  if (due)
    return { tone: "waiting", who: customer, title: `Waiting for ${customer} to pay ${money(due.amount_minor)}`, detail: `${label(due.purpose)} for the approved agreement. They pay from their review page.`, tab: "payments", action: { kind: "reissue", label: "Get a new review link" } };
  if (state === "EXCEPTION") return { tone: "alert", who: "You", title: "Resolve the late change", detail: "Work had started when the change arrived.", tab: "changes", action: { kind: "tab", label: "Open changes" } };
  if (v.job.hold_reason) return { tone: "alert", who: "You", title: "Job is on hold", detail: v.job.hold_reason, tab: "agreement", action: { kind: "clearHold", label: "Clear hold" } };
  if (!v.effective) return { tone: "action", who: "You", title: "Create the agreement", detail: "Enter or paste the agreed terms to start.", tab: "agreement", action: null };
  if (state === "HOLD" && v.readiness.blockers.length === 0)
    return { tone: "action", who: "You", title: "Everything is in place. Release the work", detail: `R${v.effective.number} is approved and the deposit is confirmed. The team will see the current job sheet.`, tab: "agreement", action: { kind: "release", label: "Release work" } };
  if (state === "READY") return { tone: "action", who: "Team", title: "Ready for production", detail: "The team can start from the current job sheet.", tab: "agreement", action: { kind: "start", label: "Mark production started" } };
  if (state === "IN_PROGRESS") return { tone: "done", who: "Team", title: "In production", detail: "New customer messages will be checked before anything changes.", tab: "conversation", action: { kind: "complete", label: "Mark completed" } };
  if (state === "COMPLETED")
    return v.funding.remainingMinor > 0 && !v.obligations.some((o) => o.purpose === "BALANCE")
      ? { tone: "action", who: "You", title: "Request the final balance", detail: `${money(v.funding.remainingMinor)} remains on the approved agreement.`, tab: "payments", action: { kind: "balance", label: "Request balance" } }
      : { tone: "done", who: "Done", title: "Job complete", detail: "Everything agreed has been delivered and recorded.", tab: "agreement", action: null };
  return { tone: "waiting", who: "You", title: "Check what is blocking this job", detail: v.readiness.blockers[0]?.message ?? "", tab: "agreement", action: null };
}
