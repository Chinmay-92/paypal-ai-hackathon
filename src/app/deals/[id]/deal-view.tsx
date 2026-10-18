"use client";

import { useState } from "react";
import type { Deal } from "@/lib/deal/types";
import { formatAmount, type Money } from "@/lib/money";
import { InspectionUpload } from "./inspection-upload";

const money = (m: Money | null) => (m ? `${m.currency} ${formatAmount(m)}` : "—");

const STEPS: { status: Deal["status"][]; label: string }[] = [
  { status: ["negotiating", "spec_proposed"], label: "Spec" },
  { status: ["spec_locked", "awaiting_buyer_payment"], label: "Authorize" },
  { status: ["deposit_captured", "challenge_issued"], label: "Photo challenge" },
  { status: ["awaiting_decision"], label: "Decision" },
  { status: ["balance_captured"], label: "Settled" },
];

export function DealView({ initial, paymentResult, paymentReason }: { initial: Deal; paymentResult: string | null; paymentReason: string | null }) {
  const [deal, setDeal] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    setBusy(String(body.type));
    setError(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Action failed");
      else setDeal(json);
      return json as Deal;
    } finally {
      setBusy(null);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.status.includes(deal.status));

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">Deal {deal.id.slice(0, 8)}</p>
          <h1 className="text-2xl font-semibold">{deal.spec?.product ?? "Custom tote bags"}</h1>
        </div>
        <ol className="flex flex-wrap gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li
              key={s.label}
              className={`rounded-full px-3 py-1 ${i === stepIndex ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : i < stepIndex ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"}`}
            >
              {s.label}
            </li>
          ))}
        </ol>
      </header>

      {paymentResult === "failed" && <Banner tone="error">PayPal step failed{paymentReason ? ` (${paymentReason})` : ""}. Check the audit log.</Banner>}
      {paymentResult === "cancelled" && <Banner tone="error">Buyer cancelled the PayPal approval.</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="space-y-3">
          <h2 className="font-semibold">Negotiation</h2>
          <ul className="space-y-2 text-sm">
            {deal.messages.map((m) => (
              <li key={m.id} className={`rounded-lg p-3 ${m.author === "buyer" ? "bg-sky-50 dark:bg-sky-950/40" : "bg-amber-50 dark:bg-amber-950/40"}`}>
                <span className="mr-2 font-mono text-xs text-neutral-500">[{m.id}] {m.author}</span>
                {m.text}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-6">
          <Card title="1 · Agreed spec">
            {!deal.spec ? (
              <Button onClick={() => act({ type: "propose_spec" })} busy={busy === "propose_spec"}>Extract spec with citations</Button>
            ) : (
              <SpecTable deal={deal} />
            )}
            {deal.status === "spec_proposed" && (
              <div className="flex flex-wrap gap-2 pt-3">
                {(["buyer", "supplier"] as const).map((party) => (
                  <Button key={party} disabled={deal.approvals[party] || deal.specProblems.length > 0} busy={busy === "approve_spec"}
                    onClick={() => act({ type: "approve_spec", party, specHash: deal.proposedSpecHash })}>
                    {deal.approvals[party] ? `${party} approved ✓` : `Approve as ${party}`}
                  </Button>
                ))}
                <Button variant="ghost" onClick={() => act({ type: "propose_spec" })} busy={busy === "propose_spec"}>Re-extract</Button>
              </div>
            )}
            {deal.specHash && <p className="pt-2 font-mono text-xs text-neutral-500">Locked · sha256 {deal.specHash.slice(0, 16)}…</p>}
          </Card>

          {deal.total && (
            <Card title="2 · PayPal authorization">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <Stat label="Order total" value={money(deal.total)} />
                <Stat label={`Deposit (${deal.depositBps / 100}%)`} value={money(deal.deposit)} sub={deal.paypal.depositCaptureId ? `captured ${deal.paypal.depositCaptureId}` : "not captured"} />
                <Stat label="Balance" value={money(deal.balance)} sub={deal.paypal.balanceCaptureId ? `captured ${deal.paypal.balanceCaptureId}` : "held on authorization"} />
              </dl>
              {deal.status === "spec_locked" && (
                <Button onClick={async () => { const d = await act({ type: "start_payment" }); if (d?.paypal?.approveUrl) window.location.href = d.paypal.approveUrl; }} busy={busy === "start_payment"}>
                  Buyer: authorize full order with PayPal
                </Button>
              )}
              {deal.status === "awaiting_buyer_payment" && deal.paypal.approveUrl && (
                <a className="inline-block rounded-md bg-[#ffc439] px-4 py-2 font-medium text-neutral-900" href={deal.paypal.approveUrl}>Continue to PayPal</a>
              )}
            </Card>
          )}

          {(deal.status === "deposit_captured" || deal.challenge) && (
            <Card title="3 · Pre-shipment photo challenge">
              {!deal.challenge ? (
                <Button onClick={() => act({ type: "issue_challenge" })} busy={busy === "issue_challenge"}>Buyer agent: issue challenge</Button>
              ) : (
                <div className="space-y-3 text-sm">
                  <p>Code to write on paper in every shot: <span className="rounded bg-neutral-900 px-2 py-1 font-mono text-lg tracking-widest text-white dark:bg-white dark:text-neutral-900">{deal.challenge.code}</span> <span className="text-neutral-500">expires {new Date(deal.challenge.expiresAt).toLocaleTimeString()}</span></p>
                  <ol className="list-decimal space-y-1 pl-5">
                    {deal.challenge.shots.map((s) => <li key={s.id}><span className="font-mono text-xs">{s.id}</span> — {s.instruction}</li>)}
                  </ol>
                  {deal.status === "challenge_issued" && <InspectionUpload deal={deal} onDone={setDeal} onError={setError} />}
                </div>
              )}
            </Card>
          )}

          {deal.qc && <QcCard deal={deal} act={act} busy={busy} />}

          <Card title="Audit log">
            <ul className="space-y-1 font-mono text-xs">
              {deal.audit.map((e, i) => (
                <li key={i}><span className="text-neutral-500">{new Date(e.at).toLocaleTimeString()} {e.actor}</span> · {e.message}</li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
    </main>
  );
}

function SpecTable({ deal }: { deal: Deal }) {
  const spec = deal.spec!;
  return (
    <div className="space-y-3 text-sm">
      <p>{spec.quantity.toLocaleString()} × {spec.product} at {spec.currency} {spec.unitPrice}</p>
      <table className="w-full text-left">
        <thead className="text-xs text-neutral-500"><tr><th className="py-1">Field</th><th>Requirement</th><th>Checked by</th><th>Source</th></tr></thead>
        <tbody>
          {spec.fields.map((f) => (
            <tr key={f.id} className="border-t border-neutral-200 align-top dark:border-neutral-800">
              <td className="py-2 pr-2 font-medium">{f.attribute}{f.critical && <span className="ml-1 text-xs text-red-600">critical</span>}</td>
              <td className="pr-2">{f.requirement}{f.colorTargetHex && <span className="ml-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: f.colorTargetHex }} />}</td>
              <td className="pr-2"><MethodBadge method={f.method} /></td>
              <td className="font-mono text-xs text-neutral-500">{f.citations.map((c) => c.messageId).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {spec.unresolved.length > 0 && (
        <div className="rounded-md bg-amber-50 p-3 dark:bg-amber-950/40">
          <p className="font-medium">Not agreed — excluded from the spec</p>
          <ul className="list-disc pl-5">{spec.unresolved.map((u) => <li key={u.topic}>{u.topic}: {u.reason}</li>)}</ul>
        </div>
      )}
      {deal.specProblems.length > 0 && <Banner tone="error">Citation problems: {deal.specProblems.join("; ")}</Banner>}
    </div>
  );
}

function QcCard({ deal, act, busy }: { deal: Deal; act: (b: Record<string, unknown>) => Promise<Deal>; busy: string | null }) {
  const qc = deal.qc!;
  const d = qc.decision;
  const remedy = deal.remedy;
  return (
    <Card title="4 · QC result and decision">
      <table className="w-full text-left text-sm">
        <tbody>
          {qc.fields.map((f) => (
            <tr key={f.fieldId} className="border-t border-neutral-200 align-top dark:border-neutral-800">
              <td className="py-2 pr-2 font-medium">{f.fieldId}</td>
              <td className="pr-2"><Verdict v={f.verdict} /></td>
              <td className="text-neutral-600 dark:text-neutral-400">{f.evidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 space-y-2 text-sm">
        {deal.status === "balance_captured" && <Banner tone="ok">Balance captured: {deal.paypal.balanceCaptureId}</Banner>}
        {deal.status === "awaiting_decision" && d.action === "human_review" && (
          <>
            <p>Fields need a human check: {d.fieldIds.join(", ") || "none returned"}.</p>
            <Button onClick={() => act({ type: "resolve", action: "buyer_release" })} busy={busy === "resolve"}>Buyer: I checked them — release balance</Button>
          </>
        )}
        {deal.status === "awaiting_decision" && d.action === "buyer_approval" && (
          <>
            <p>{d.reason}.</p>
            <Button onClick={() => act({ type: "resolve", action: "buyer_release" })} busy={busy === "resolve"}>Buyer: release {money(d.amount)}</Button>
          </>
        )}
        {deal.status === "awaiting_decision" && d.action === "remedy" && (
          <div className="space-y-2">
            <p>Failed: {d.failedFieldIds.join(", ")}{d.criticalFailure && " (critical)"}.</p>
            {remedy ? (
              <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
                <p className="font-medium">Supplier agent offer: {remedy.offer.kind === "discount" ? `${remedy.offer.discountBps / 100}% off the balance` : `remake in ${remedy.offer.days} days`}</p>
                <p className="text-neutral-600 dark:text-neutral-400">{remedy.offer.note}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Supplier {remedy.supplierApproved ? "approved" : "approval needed (beyond agent limit)"} · Buyer {remedy.buyerAccepted ? "accepted" : "not yet accepted"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!remedy.supplierApproved && <Button onClick={() => act({ type: "resolve", action: "supplier_approve_remedy" })} busy={busy === "resolve"}>Supplier: approve offer</Button>}
                  {!remedy.buyerAccepted && <Button onClick={() => act({ type: "resolve", action: "buyer_accept_remedy" })} busy={busy === "resolve"}>Buyer: accept</Button>}
                  <Button variant="ghost" onClick={() => act({ type: "resolve", action: "request_new_offer" })} busy={busy === "resolve"}>Buyer: ask for a better offer</Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => act({ type: "resolve", action: "request_new_offer" })} busy={busy === "resolve"}>Ask supplier agent for an offer</Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function MethodBadge({ method }: { method: string }) {
  const label: Record<string, string> = { vision: "Vision model", color_delta_e: "ΔE2000 (code)", count_per_layer: "Human count", human: "Human" };
  return <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">{label[method] ?? method}</span>;
}

function Verdict({ v }: { v: string }) {
  const style = v === "pass" ? "bg-emerald-100 text-emerald-900" : v === "fail" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${style}`}>{v === "cant_verify" ? "human check" : v}</span>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-mono">{value}</dd>
      {sub && <dd className="font-mono text-xs text-neutral-500">{sub}</dd>}
    </div>
  );
}

function Banner({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  return <div className={`rounded-md p-3 text-sm ${tone === "error" ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200" : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>{children}</div>;
}

function Button({ children, onClick, busy, disabled, variant = "solid" }: { children: React.ReactNode; onClick: () => void; busy?: boolean; disabled?: boolean; variant?: "solid" | "ghost" }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${variant === "solid" ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}
    >
      {busy ? "Working…" : children}
    </button>
  );
}
