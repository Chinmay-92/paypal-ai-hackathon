import Link from "next/link";
import { proposalOf } from "@/application/changes";
import { merchantJobView } from "@/application/jobs";
import { scopeDiff } from "@/domain/revision";
import { formatScopeValue } from "@/domain/templates";
import { paymentsConfigured } from "@/integrations/paypal/http";
import { currentMerchant } from "@/server/http";
import { ActionButton } from "@/ui/ActionButton";
import { Badge } from "@/ui/Badge";
import { label, money, when } from "@/ui/format";
import { ChangeReview } from "./ChangeReview";
import { ManualAmendment } from "./ManualAmendment";
import { MessageForm } from "./MessageForm";
import { HoldForm, PublishDraft, RefundForm, ReissueLink } from "./Actions";

function Highlighted({ text, spans }: { text: string; spans: string[] }) {
  const span = spans.find((s) => s && text.includes(s));
  if (!span) return <>{text}</>;
  const i = text.indexOf(span);
  return (
    <>
      {text.slice(0, i)}
      <mark>{span}</mark>
      <Highlighted text={text.slice(i + span.length)} spans={spans.filter((s) => s !== span)} />
    </>
  );
}

export default async function JobPage(props: PageProps<"/app/jobs/[id]">) {
  const { id } = await props.params;
  const actor = await currentMerchant();
  const v = await merchantJobView(actor, id);
  const owner = actor.role === "owner";
  const tz = v.job.timezone;
  const base = v.effective ?? v.pending;
  const baseScope = base?.content.scope ?? {};
  const fields = v.template.fields;
  const spansByMessage = new Map<string, string[]>();
  for (const cr of v.changeRequests) {
    for (const c of proposalOf(cr)?.proposedChanges ?? []) spansByMessage.set(c.sourceId, [...(spansByMessage.get(c.sourceId) ?? []), c.quotedSpan]);
  }
  const openCrs = v.changeRequests.filter((c) => c.status === "NEEDS_REVIEW" || c.status === "ANALYZING");
  const otherCrs = v.changeRequests.filter((c) => !openCrs.includes(c));
  const blockerCodes = v.readiness.blockers.map((b) => b.code);
  const started = v.job.started_at !== null;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>{v.job.title}</h1>
          <p className="muted">
            {v.template.label} · {v.customer.name} · Currency {v.job.currency} · Times in {tz} ·{" "}
            {v.effective ? `Current agreement R${v.effective.number}` : "No approved agreement yet"} {v.pending && `· R${v.pending.number} awaiting customer`}
          </p>
        </div>
        <div className="row">
          <Badge status={v.job.fulfillment_state} />
          <Link className="button" href={`/app/jobs/${id}/history`}>
            History
          </Link>
          <Link className="button" href={`/app/jobs/${id}/fulfillment`}>
            Job sheet
          </Link>
        </div>
      </div>

      {v.job.fulfillment_state === "EXCEPTION" && (
        <div className="notice bad" role="status">
          Work has started. The shop must confirm whether this change is possible.
        </div>
      )}

      <div className="workspace">
        {/* Source conversation */}
        <section className="panel" aria-labelledby="sources-h">
          <h2 id="sources-h">Source conversation</h2>
          <p className="muted small">Pasted messages are user-supplied and unverified. Portal messages come from the customer&apos;s review session.</p>
          {v.messages.length === 0 && <p className="muted">No messages yet.</p>}
          {v.messages.map((m) => (
            <div className="message" key={m.id}>
              <div className="meta">
                {m.author_label} ({m.author_role}) · {m.sent_at_label ? `stated time ${m.sent_at_label}` : when(m.created_at, tz)} ·{" "}
                {m.provenance === "portal_authenticated" ? <Badge status="ACCEPTED" text="Sent in portal" /> : <Badge status="DRAFT" text="Pasted, unverified" />}
              </div>
              <p>
                <Highlighted text={m.body} spans={spansByMessage.get(m.id) ?? []} />
              </p>
            </div>
          ))}
          {owner && base && <MessageForm jobId={id} customerName={v.customer.name} />}
          {!base && <p className="muted small">Publish the original agreement before adding correspondence.</p>}
        </section>

        {/* Proposed changes against the agreement */}
        <section aria-labelledby="changes-h">
          <h2 id="changes-h" className="sr-only">
            Changes
          </h2>
          {v.draft && (
            <div className="panel">
              <h2>
                Draft revision R{v.draft.number} <Badge status="DRAFT" />
              </h2>
              <DiffTable fields={fields} before={base?.content.scope ?? {}} after={v.draft.content.scope} domain={v.job.domain} />
              <p>
                Total <strong>{money(v.draft.total_minor)}</strong> {base && <span className="muted">(was {money(base.total_minor)})</span>} · deposit {v.draft.content.depositBps / 100}%
              </p>
              {v.draftProblems.length > 0 ? (
                <div className="notice warn" role="status">
                  <p>Resolve before publishing:</p>
                  <ul>{v.draftProblems.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              ) : (
                <p className="small muted">Ready to publish. Publishing replaces any unanswered proposal and creates a review link for you to send.</p>
              )}
              {owner && (
                <PublishDraft
                  jobId={id}
                  revisionId={v.draft.id}
                  version={v.job.version}
                  started={started}
                  disabled={v.draftProblems.length > 0}
                  customerName={v.customer.name}
                  title={v.job.title}
                />
              )}
            </div>
          )}

          {v.pending && (
            <div className="panel">
              <h2>
                R{v.pending.number} awaiting customer <Badge status="PUBLISHED" text="Awaiting decision" />
              </h2>
              <p className="small muted">
                Published {when(v.pending.published_at, tz)}. Content hash <code>{v.pending.content_hash.slice(0, 12)}</code>.
              </p>
              <DiffTable fields={fields} before={v.effective?.content.scope ?? {}} after={v.pending.content.scope} domain={v.job.domain} />
              {owner && <ReissueLink jobId={id} />}
            </div>
          )}

          {openCrs.map((cr) => (
            <ChangeReview
              key={cr.id}
              jobId={id}
              version={v.job.version}
              cr={{ id: cr.id, status: cr.status, intent: cr.intent, extractor: cr.extractor, issues: cr.validation_issues, draftReply: cr.draft_reply, baseRevisionId: cr.base_revision_id, createdAt: cr.created_at.toISOString() }}
              proposal={proposalOf(cr)}
              baseScope={baseScope}
              baseIsCurrent={cr.base_revision_id === base?.id}
              fields={fields}
              domain={v.job.domain}
              rateCard={v.catalog.rateCard}
              artwork={v.catalog.artwork}
              depositBps={base?.content.depositBps ?? 5000}
              started={started}
              canEdit={owner && !v.draft}
            />
          ))}

          {owner && base && !v.draft && (
            <ManualAmendment jobId={id} version={v.job.version} fields={fields} domain={v.job.domain} baseScope={baseScope} baseItems={base.content.lineItems} rateCard={v.catalog.rateCard} artwork={v.catalog.artwork} depositBps={base.content.depositBps} started={started} />
          )}

          {otherCrs.length > 0 && (
            <div className="panel">
              <h2>Earlier messages</h2>
              <ul className="timeline">
                {otherCrs.map((cr) => {
                  const p = proposalOf(cr);
                  return (
                    <li key={cr.id}>
                      <span className="small muted">{when(cr.created_at, tz)}</span>
                      <span>
                        <Badge status={cr.status} /> {cr.intent && <span className="badge">{label(cr.intent)}</span>}
                        {cr.intent === "question" && <span className="small"> This asks a question; the order has not changed.</span>}
                        {cr.intent === "approval_like" && <span className="small"> Sounds like approval, but approval only happens on the review page.</span>}
                        {cr.review_note && <div className="small">Note: {cr.review_note}</div>}
                        {p?.draftReply && cr.status === "NO_CHANGE" && <div className="small muted">Suggested reply (not sent): {p.draftReply}</div>}
                        {owner && cr.status === "NO_CHANGE" && <ReopenButton jobId={id} crId={cr.id} version={v.job.version} />}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* Commercial, approval and payment summary */}
        <section aria-labelledby="summary-h">
          <div className="panel">
            <h2 id="summary-h">Agreement and payment</h2>
            {v.effective ? (
              <dl className="kv">
                <dt>Current agreement</dt>
                <dd>
                  R{v.effective.number} <Badge status={v.effective.status} />
                </dd>
                <dt>Total</dt>
                <dd>{money(v.effective.total_minor)}</dd>
                <dt>Deposit required ({v.effective.content.depositBps / 100}%)</dt>
                <dd>{money(v.funding.depositTargetMinor)}</dd>
                <dt>Received (completed, net of refunds)</dt>
                <dd>{money(v.funding.creditedMinor)}</dd>
                <dt className="strong">Deposit still due</dt>
                <dd className="strong">{money(v.funding.depositDueMinor)}</dd>
                <dt>Balance after deposit</dt>
                <dd>{money(v.funding.remainingMinor)}</dd>
              </dl>
            ) : (
              <p className="muted">The customer has not approved an agreement yet.</p>
            )}
            {!paymentsConfigured() && <p className="notice warn small">PayPal sandbox is not configured on this server; customers cannot pay.</p>}
          </div>

          <div className="panel">
            <h2>Work readiness</h2>
            {v.readiness.blockers.length === 0 ? (
              <p>
                <Badge status="READY" text="Nothing blocks release" />
              </p>
            ) : (
              <ul>{v.readiness.blockers.map((b) => <li key={b.code}>{b.message}</li>)}</ul>
            )}
            <div className="row">
              {owner && ["HOLD", "EXCEPTION"].includes(v.job.fulfillment_state) && (
                <ActionButton className="primary" url={`/api/jobs/${id}/release`} body={{ expectedVersion: v.job.version }} disabled={blockerCodes.length > 0} disabledReason="Resolve the items above first">
                  Release work
                </ActionButton>
              )}
              {v.job.fulfillment_state === "READY" && (
                <ActionButton className="primary" url={`/api/jobs/${id}/start`} body={{ expectedVersion: v.job.version }}>
                  Mark production started
                </ActionButton>
              )}
              {owner && v.job.fulfillment_state === "IN_PROGRESS" && (
                <ActionButton url={`/api/jobs/${id}/complete`} body={{ expectedVersion: v.job.version }}>
                  Mark completed
                </ActionButton>
              )}
              {owner && v.effective && !v.pending && v.funding.remainingMinor > 0 && v.funding.depositDueMinor === 0 && (
                <ActionButton url={`/api/jobs/${id}/balance`} body={{ expectedVersion: v.job.version }} confirm="Ask the customer to pay the remaining balance now?">
                  Request final balance
                </ActionButton>
              )}
            </div>
            {owner && <HoldForm jobId={id} version={v.job.version} holdReason={v.job.hold_reason} />}
          </div>

          <div className="panel">
            <h2>Payments</h2>
            {v.obligations.length === 0 && <p className="muted">No payments requested yet.</p>}
            {v.obligations.map((o) => {
              const rev = v.revisions.find((r) => r.id === o.revision_id);
              const caps = v.captures.filter((c) => c.obligation_id === o.id);
              return (
                <div key={o.id} className="stack" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "0.75rem" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span>
                      <strong>{label(o.purpose)}</strong> for R{rev?.number} · {money(o.amount_minor)}
                    </span>
                    <Badge status={o.status} />
                  </div>
                  {o.status === "UNKNOWN" && <p className="small">We are checking the payment result with PayPal.</p>}
                  {o.status === "PENDING" && <p className="small">Payment is pending. Work has not been released.</p>}
                  {["UNKNOWN", "PENDING", "PROCESSING"].includes(o.status) && (
                    <ActionButton url={`/api/obligations/${o.id}/reconcile`}>Check payment status</ActionButton>
                  )}
                  {caps.map((c) => {
                    const refunds = v.refunds.filter((r) => r.capture_id === c.id);
                    return (
                      <div key={c.id} className="small stack">
                        <div>
                          Capture <code>{c.provider_capture_id}</code> · {money(c.amount_minor)} · PayPal status {label(c.provider_status)} {!c.credited && <Badge status="REVIEW_REQUIRED" text="Not credited" />}
                        </div>
                        {owner && o.status === "REVIEW_REQUIRED" && !c.credited && (
                          <div className="notice warn">
                            <p>This payment arrived for a revision that was replaced. Decide what happens with the money; nothing is automatic.</p>
                            <div className="row">
                              <ActionButton url={`/api/captures/${c.id}/resolve`} body={{ resolution: "credit_to_current", note: "Carry forward to current agreement" }} confirm="Credit this payment to the current agreement?">
                                Credit to current agreement
                              </ActionButton>
                              {c.resolution !== "REFUND_REVIEW" && (
                                <ActionButton url={`/api/captures/${c.id}/resolve`} body={{ resolution: "refund_review", note: "Customer to be refunded" }}>
                                  Plan a refund
                                </ActionButton>
                              )}
                            </div>
                          </div>
                        )}
                        {refunds.map((r) => (
                          <div key={r.id}>
                            Refund {money(r.amount_minor)} <Badge status={r.status} /> <span className="muted">{r.reason}</span>
                            {r.status === "PENDING" && <span> Refund requested; completion is not yet confirmed.</span>}
                            {owner && ["PENDING", "UNKNOWN", "RESERVED"].includes(r.status) && <ActionButton url={`/api/refunds/${r.id}/reconcile`}>Check refund</ActionButton>}
                          </div>
                        ))}
                        {owner && ["COMPLETED", "PARTIALLY_REFUNDED"].includes(c.provider_status) && <RefundForm captureId={c.id} />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <details className="panel">
            <summary>Payment trace (developer / judge view)</summary>
            <p className="small muted">Durable operations with their idempotency keys. Provider: {paymentsConfigured() ? "PayPal sandbox" : "not configured"}.</p>
            <div className="table-wrap">
              <table className="trace">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Key</th>
                    <th>Order</th>
                    <th>Tries</th>
                  </tr>
                </thead>
                <tbody>
                  {v.operations.map((op) => (
                    <tr key={op.id}>
                      <td>{op.kind}</td>
                      <td>{op.status}</td>
                      <td>{op.idempotency_key}</td>
                      <td>{op.provider_order_id ?? "—"}</td>
                      <td>
                        {op.attempts}
                        {op.last_error && <div>{op.last_error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </div>
    </>
  );
}

function DiffTable({ fields, before, after, domain }: { fields: readonly { path: string; label: string }[]; before: Record<string, unknown>; after: Record<string, unknown>; domain: "apparel" | "website" }) {
  const diff = scopeDiff(domain, before as never, after as never);
  if (diff.length === 0) return <p className="muted small">No scope changes (price or terms only).</p>;
  return (
    <div className="table-wrap">
      <table className="diff">
        <caption className="sr-only">Changed fields</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Current</th>
            <th scope="col">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {diff.map((d) => (
            <tr key={d.path}>
              <th scope="row">{fields.find((f) => f.path === d.path)?.label ?? d.path}</th>
              <td className="old">
                <span className="sr-only">was </span>
                <del>{formatScopeValue(d.oldValue)}</del>
              </td>
              <td className="new">
                <span className="sr-only">becomes </span>
                <ins>{formatScopeValue(d.newValue)}</ins>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReopenButton({ jobId, crId, version }: { jobId: string; crId: string; version: number }) {
  return (
    <ActionButton className="link" url={`/api/jobs/${jobId}/changes/${crId}/review`} body={{ decision: "reopen", expectedVersion: version, note: "Merchant treats this message as a change request" }}>
      Treat as a change request
    </ActionButton>
  );
}
