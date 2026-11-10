import Link from "next/link";
import { proposalOf } from "@/application/changes";
import { merchantJobView, type MerchantJobView } from "@/application/jobs";
import { scopeDiff } from "@/domain/revision";
import { paymentsConfigured } from "@/integrations/paypal/http";
import { currentMerchant } from "@/server/http";
import { ActionButton } from "@/ui/ActionButton";
import { Badge } from "@/ui/Badge";
import { label, money, when } from "@/ui/format";
import { nextStep, track, type NextStep, type Tab } from "@/ui/guidance";
import { labelsOf, ValueView } from "@/ui/ValueView";
import { HoldForm, PublishDraft, RefundForm, ReissueLink } from "./Actions";
import { ChangeReview } from "./ChangeReview";
import { FileUpload } from "./FileUpload";
import { ManualAmendment } from "./ManualAmendment";
import { MessageForm } from "./MessageForm";
import { TelegramLink } from "./TelegramLink";

const TABS: { key: Tab; label: string }[] = [
  { key: "changes", label: "Changes" },
  { key: "conversation", label: "Conversation" },
  { key: "payments", label: "Payments" },
  { key: "agreement", label: "Agreement" },
];

const ICON: Record<NextStep["tone"], string> = { action: "!", waiting: "…", done: "✓", alert: "!" };

export default async function JobPage(props: PageProps<"/app/jobs/[id]">) {
  const { id } = await props.params;
  const { tab: requested } = (await props.searchParams) as { tab?: string };
  const actor = await currentMerchant();
  const v = await merchantJobView(actor, id);
  const owner = actor.role === "owner";
  const step = nextStep(v);
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : owner ? step.tab : "agreement";
  const labels = labelsOf(v.catalog.artwork);
  const openCount = v.changeRequests.filter((c) => c.status === "NEEDS_REVIEW" || c.status === "ANALYZING").length + (v.draft ? 1 : 0);
  const paymentAlerts = v.obligations.filter((o) => ["UNKNOWN", "PENDING", "REVIEW_REQUIRED"].includes(o.status)).length;

  return (
    <>
      <Link className="back" href="/app/jobs">
        ← All jobs
      </Link>
      <div className="page-head">
        <div>
          <h1>{v.job.title}</h1>
          <div className="sub">
            <span>{v.customer.name}</span>
            <span>{v.template.label}</span>
            <span>
              Prices in {v.job.currency}, times in {v.job.timezone}
            </span>
          </div>
        </div>
        <div className="row">
          <Link className="button" href={`/app/jobs/${id}/history`}>
            History
          </Link>
          <Link className="button" href={`/app/jobs/${id}/fulfillment`}>
            Job sheet
          </Link>
        </div>
      </div>

      <TrackCompact steps={track(v)} />
      <ol className="track" aria-label="Job progress">
        {track(v).map((s) => (
          <li key={s.key} className={s.state} aria-current={s.state === "current" ? "step" : undefined}>
            {s.label}
            {s.note && <span className="note">{s.note}</span>}
            <span className="sr-only">{s.state === "done" ? " (done)" : s.state === "current" ? " (current)" : ""}</span>
          </li>
        ))}
      </ol>

      {owner && <NextStepBar step={step} v={v} />}

      <div className="layout">
        <div>
          <nav className="tabs" aria-label="Job sections">
            {TABS.map((t) => (
              <Link key={t.key} href={`/app/jobs/${id}?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} scroll={false}>
                {t.label}
                {t.key === "changes" && openCount > 0 && <span className="count">{openCount}</span>}
                {t.key === "conversation" && v.messages.length > 0 && <span className="muted small">{v.messages.length}</span>}
                {t.key === "payments" && paymentAlerts > 0 && <span className="count">{paymentAlerts}</span>}
              </Link>
            ))}
          </nav>
          {tab === "changes" && <ChangesTab v={v} owner={owner} labels={labels} />}
          {tab === "conversation" && <ConversationTab v={v} owner={owner} />}
          {tab === "payments" && <PaymentsTab v={v} owner={owner} />}
          {tab === "agreement" && <AgreementTab v={v} labels={labels} />}
        </div>
        <aside aria-label="Job summary">
          <MoneyPanel v={v} />
          <ReadinessPanel v={v} owner={owner} />
        </aside>
      </div>
    </>
  );
}

function TrackCompact({ steps }: { steps: ReturnType<typeof track> }) {
  const done = steps.filter((s) => s.state === "done").length;
  const current = steps.find((s) => s.state === "current");
  return (
    <div className="track-compact" aria-hidden="true">
      <strong>{current ? `Step ${done + 1} of ${steps.length}: ${current.label}` : "All steps complete"}</strong>
      {current?.note && <span className="muted small"> ({current.note})</span>}
      <div className="bar">
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
    </div>
  );
}

function NextStepBar({ step, v }: { step: NextStep; v: MerchantJobView }) {
  const id = v.job.id;
  const body = { expectedVersion: v.job.version };
  const a = step.action;
  return (
    <section className={`next-step ${step.tone === "action" ? "" : step.tone}`} aria-labelledby="next-step-title">
      <span className="icon" aria-hidden="true">
        {ICON[step.tone]}
      </span>
      <div>
        <div className="who">{step.tone === "waiting" ? "Nothing for you to do right now" : step.tone === "done" ? "Up to date" : step.tone === "alert" ? "Needs your decision" : "Your next step"}</div>
        <h2 id="next-step-title">{step.title}</h2>
        <p>{step.detail}</p>
      </div>
      <div className="actions">
        {a?.kind === "tab" && (
          <Link className="button primary" href={`/app/jobs/${id}?tab=${step.tab}`} scroll={false}>
            {a.label}
          </Link>
        )}
        {a?.kind === "reissue" && <ReissueLink jobId={id} label={a.label} />}
        {a?.kind === "release" && (
          <ActionButton className="primary" url={`/api/jobs/${id}/release`} body={body}>
            {a.label}
          </ActionButton>
        )}
        {a?.kind === "start" && (
          <ActionButton className="primary" url={`/api/jobs/${id}/start`} body={body}>
            {a.label}
          </ActionButton>
        )}
        {a?.kind === "complete" && (
          <ActionButton url={`/api/jobs/${id}/complete`} body={body} confirm="Mark this job as completed?">
            {a.label}
          </ActionButton>
        )}
        {a?.kind === "balance" && (
          <ActionButton className="primary" url={`/api/jobs/${id}/balance`} body={body} confirm="Ask the customer to pay the remaining balance now?">
            {a.label}
          </ActionButton>
        )}
        {a?.kind === "reconcile" && a.obligationId && <ActionButton url={`/api/obligations/${a.obligationId}/reconcile`}>{a.label}</ActionButton>}
        {a?.kind === "clearHold" && (
          <ActionButton url={`/api/jobs/${id}/hold`} body={{ ...body, reason: null }}>
            {a.label}
          </ActionButton>
        )}
      </div>
    </section>
  );
}

function MoneyPanel({ v }: { v: MerchantJobView }) {
  return (
    <div className="panel">
      <h2>Money</h2>
      {v.effective ? (
        <dl className="kv">
          <dt>Agreed total (R{v.effective.number})</dt>
          <dd>{money(v.effective.total_minor)}</dd>
          <dt>Deposit required ({v.effective.content.depositBps / 100}%)</dt>
          <dd>{money(v.funding.depositTargetMinor)}</dd>
          <dt>Received</dt>
          <dd>{money(v.funding.creditedMinor)}</dd>
          <span className="rule" />
          <dt className="strong">Deposit still due</dt>
          <dd className="strong">{money(v.funding.depositDueMinor)}</dd>
          <dt>Balance after deposit</dt>
          <dd>{money(v.funding.remainingMinor)}</dd>
        </dl>
      ) : (
        <p className="muted">Nothing is owed until the customer approves an agreement.</p>
      )}
      {v.pending && (
        <p className="small muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          Proposed R{v.pending.number}: {money(v.pending.total_minor)}. Takes effect only if the customer approves.
        </p>
      )}
      {!paymentsConfigured() && <p className="notice warn small">PayPal sandbox is not configured on this server.</p>}
    </div>
  );
}

function ReadinessPanel({ v, owner }: { v: MerchantJobView; owner: boolean }) {
  const codes = new Set(v.readiness.blockers.map((b) => b.code));
  const items = [
    { ok: !codes.has("NO_APPROVED_REVISION") && !codes.has("PENDING_REVISION"), text: "Customer approved the current agreement" },
    { ok: !!v.effective && !codes.has("DEPOSIT_DUE"), text: "Deposit received and confirmed" },
    { ok: !codes.has("UNRESOLVED_AMENDMENT") && !v.draft, text: "No change requests waiting" },
    { ok: !codes.has("PAYMENT_UNKNOWN") && !codes.has("PAYMENT_PENDING") && !codes.has("PAYMENT_REVIEW"), text: "Every payment confirmed by PayPal" },
    { ok: !codes.has("MANUAL_HOLD") && !codes.has("EXCEPTION"), text: "No hold on the job" },
  ];
  return (
    <div className="panel">
      <div className="section-head">
        <h2>Ready to release</h2>
        <Badge status={v.job.fulfillment_state} />
      </div>
      <ul className="checklist">
        {items.map((i) => (
          <li key={i.text} className={i.ok ? "yes" : "no"}>
            <span className="mark" aria-hidden="true">
              {i.ok ? "✓" : ""}
            </span>
            <span>
              {i.text}
              <span className="sr-only">{i.ok ? ": done" : ": not yet"}</span>
            </span>
          </li>
        ))}
      </ul>
      {owner && (
        <div className="section">
          <HoldForm jobId={v.job.id} version={v.job.version} holdReason={v.job.hold_reason} />
        </div>
      )}
    </div>
  );
}

function ChangesTab({ v, owner, labels }: { v: MerchantJobView; owner: boolean; labels: Record<string, string> }) {
  const base = v.effective ?? v.pending;
  const fields = v.template.fields;
  const open = v.changeRequests.filter((c) => c.status === "NEEDS_REVIEW" || c.status === "ANALYZING");
  const earlier = v.changeRequests.filter((c) => !open.includes(c));
  const started = v.job.started_at !== null;
  const nothing = open.length === 0 && !v.draft && !v.pending;
  return (
    <div>
      {v.job.fulfillment_state === "EXCEPTION" && <div className="notice bad">Work has started. The shop must confirm whether this change is possible.</div>}

      {open.map((cr) => (
        <ChangeReview
          key={cr.id}
          jobId={v.job.id}
          version={v.job.version}
          cr={{ id: cr.id, status: cr.status, intent: cr.intent, extractor: cr.extractor, issues: cr.validation_issues, draftReply: cr.draft_reply, baseRevisionId: cr.base_revision_id, createdAt: cr.created_at.toISOString() }}
          proposal={proposalOf(cr)}
          baseScope={base?.content.scope ?? {}}
          baseIsCurrent={cr.base_revision_id === base?.id}
          fields={fields}
          domain={v.job.domain}
          rateCard={v.catalog.rateCard}
          artwork={v.catalog.artwork}
          labels={labels}
          depositBps={base?.content.depositBps ?? 5000}
          started={started}
          canEdit={owner && !v.draft}
        />
      ))}
      {v.draft && (
        <div className="panel">
          <div className="section-head">
            <h2>{base ? `Draft revision R${v.draft.number}` : `Draft agreement R${v.draft.number}`}</h2>
            <Badge status="DRAFT" />
          </div>
          <DiffTable fields={fields} before={v.effective?.content.scope ?? {}} after={v.draft.content.scope} domain={v.job.domain} labels={labels} />
          <p style={{ marginTop: "0.75rem" }}>
            Total <strong>{money(v.draft.total_minor)}</strong>
            {v.effective && <span className="muted"> (now {money(v.effective.total_minor)})</span>}, deposit {v.draft.content.depositBps / 100}%
          </p>
          {v.draftProblems.length > 0 && (
            <div className="notice warn" role="status">
              <p>Resolve before publishing:</p>
              <ul>{v.draftProblems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {owner && (
            <PublishDraft
              jobId={v.job.id}
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
          <div className="section-head">
            <h2>{v.effective ? `R${v.pending.number} is with the customer` : `Agreement R${v.pending.number} is with the customer`}</h2>
            <Badge status="PUBLISHED" text="Awaiting decision" />
          </div>
          <p className="small muted">
            Published {when(v.pending.published_at, v.job.timezone)}. The customer approves this exact version (fingerprint <code>{v.pending.content_hash.slice(0, 10)}</code>).
          </p>
          <DiffTable fields={fields} before={v.effective?.content.scope ?? {}} after={v.pending.content.scope} domain={v.job.domain} labels={labels} />
        </div>
      )}


      {nothing && (
        <div className="panel empty">
          <h2>No changes waiting</h2>
          <p>When the customer asks for something, add their message in Conversation. Pact will propose the change for you to review.</p>
          <Link className="button" href={`/app/jobs/${v.job.id}?tab=conversation`} scroll={false}>
            Add a customer message
          </Link>
        </div>
      )}

      {owner && base && !v.draft && (
        <ManualAmendment
          jobId={v.job.id}
          version={v.job.version}
          fields={fields}
          domain={v.job.domain}
          baseScope={base.content.scope}
          baseItems={base.content.lineItems}
          rateCard={v.catalog.rateCard}
          artwork={v.catalog.artwork}
          depositBps={base.content.depositBps}
          started={started}
        />
      )}

      {earlier.length > 0 && (
        <div className="panel">
          <h2>Earlier messages</h2>
          <ul className="timeline">
            {earlier.map((cr) => {
              const p = proposalOf(cr);
              return (
                <li key={cr.id}>
                  <span className="small muted">{when(cr.created_at, v.job.timezone)}</span>
                  <span>
                    <span className="row">
                      <Badge status={cr.status} />
                      {cr.intent && <span className="badge">{label(cr.intent)}</span>}
                    </span>
                    {cr.intent === "question" && <div className="small">A question. The order has not changed.</div>}
                    {cr.intent === "approval_like" && <div className="small">Sounds like approval, but customers approve only on their review page.</div>}
                    {cr.review_note && <div className="small">Note: {cr.review_note}</div>}
                    {p?.draftReply && cr.status === "NO_CHANGE" && <div className="small muted">Suggested reply (not sent): {p.draftReply}</div>}
                    {owner && cr.status === "NO_CHANGE" && (
                      <ActionButton
                        className="link"
                        url={`/api/jobs/${v.job.id}/changes/${cr.id}/review`}
                        body={{ decision: "reopen", expectedVersion: v.job.version, note: "Merchant treats this message as a change request" }}
                      >
                        Treat as a change request
                      </ActionButton>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

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

function ConversationTab({ v, owner }: { v: MerchantJobView; owner: boolean }) {
  const base = v.effective ?? v.pending;
  const spans = new Map<string, string[]>();
  for (const cr of v.changeRequests) for (const c of proposalOf(cr)?.proposedChanges ?? []) spans.set(c.sourceId, [...(spans.get(c.sourceId) ?? []), c.quotedSpan]);
  const files = new Map(v.attachments.map((a) => [a.id, a]));
  return (
    <div>
      <div className="panel">
        <h2>Messages</h2>
        <p className="small muted">Pasted and Telegram messages are unverified. Messages sent from the customer&apos;s review page are marked as such. Highlighted text is what Pact quoted.</p>
        {v.messages.length === 0 && <p className="muted">No messages yet.</p>}
        {v.messages.map((m) => (
          <div className="message" key={m.id}>
            <div className="meta">
              <strong>{m.author_label}</strong>
              <span>{m.sent_at_label ? `said ${m.sent_at_label}` : when(m.created_at, v.job.timezone)}</span>
              {m.provenance === "portal_authenticated" ? <Badge status="ACCEPTED" text="From review page" /> : <Badge status="DRAFT" text={m.provenance === "telegram" ? "Telegram · identity unverified" : "Pasted copy"} />}
            </div>
            <p>
              <Highlighted text={m.body} spans={spans.get(m.id) ?? []} />
            </p>
            {m.attachment_ids.length > 0 && (
              <p className="small">
                Attached:{" "}
                {m.attachment_ids.map((fid) => (
                  <a key={fid} href={`/api/attachments/${fid}`} target="_blank" rel="noopener" style={{ marginRight: "0.6rem" }}>
                    {files.get(fid)?.filename ?? "file"}
                  </a>
                ))}
              </p>
            )}
          </div>
        ))}
        {owner && base && (
          <div className="section">
            <TelegramLink jobId={v.job.id} />
            <MessageForm jobId={v.job.id} customerName={v.customer.name} />
          </div>
        )}
        {!base && <p className="small muted">Send the agreement to the customer before adding messages.</p>}
      </div>
      <div className="panel">
        <h2>Files</h2>
        {v.attachments.length === 0 ? (
          <p className="muted small">No files yet. Images you add here can be chosen as artwork for this job.</p>
        ) : (
          <ul className="small" style={{ paddingLeft: "1.1rem" }}>
            {v.attachments.map((a) => (
              <li key={a.id} style={{ marginBottom: "0.35rem" }}>
                <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener">
                  {a.filename}
                </a>{" "}
                <span className="muted">
                  {Math.ceil(a.size_bytes / 1024)} KB, from the {a.uploaded_by_kind === "customer" ? "customer" : "business"}
                </span>{" "}
                {a.content_type.startsWith("image/") && <span className="badge accent">Usable as artwork</span>}
              </li>
            ))}
          </ul>
        )}
        {owner && base && <FileUpload jobId={v.job.id} />}
      </div>
    </div>
  );
}

function PaymentsTab({ v, owner }: { v: MerchantJobView; owner: boolean }) {
  return (
    <div>
      <div className="panel">
        <h2>Payments</h2>
        {v.obligations.length === 0 && <p className="muted">No payments requested yet. A deposit request is created when the customer approves the agreement.</p>}
        {v.obligations.map((o) => {
          const rev = v.revisions.find((r) => r.id === o.revision_id);
          const caps = v.captures.filter((c) => c.obligation_id === o.id);
          return (
            <div key={o.id} className="section">
              <div className="section-head">
                <h3>
                  {label(o.purpose)} for R{rev?.number}: {money(o.amount_minor)}
                </h3>
                <Badge status={o.status} />
              </div>
              {o.status === "UNKNOWN" && <p className="small">We are checking the payment result with PayPal.</p>}
              {o.status === "PENDING" && <p className="small">Payment is pending. Work has not been released.</p>}
              {["UNKNOWN", "PENDING", "PROCESSING"].includes(o.status) && <ActionButton url={`/api/obligations/${o.id}/reconcile`}>Check payment status</ActionButton>}
              {caps.map((c) => {
                const refunds = v.refunds.filter((r) => r.capture_id === c.id);
                return (
                  <div key={c.id} className="stack small" style={{ marginTop: "0.6rem" }}>
                    <div>
                      PayPal capture <code>{c.provider_capture_id}</code>: {money(c.amount_minor)}, {label(c.provider_status).toLowerCase()}
                      {!c.credited && (
                        <>
                          {" "}
                          <Badge status="REVIEW_REQUIRED" text="Not counted yet" />
                        </>
                      )}
                    </div>
                    {owner && o.status === "REVIEW_REQUIRED" && !c.credited && (
                      <div className="notice warn">
                        <p>This payment arrived for a proposal that was replaced. Nothing happens to it automatically.</p>
                        <div className="row">
                          <ActionButton url={`/api/captures/${c.id}/resolve`} body={{ resolution: "credit_to_current", note: "Carry forward to current agreement" }} confirm="Count this payment toward the current agreement?">
                            Count toward current agreement
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
                      <div key={r.id} className="row">
                        Refund {money(r.amount_minor)} <Badge status={r.status} /> <span className="muted">{r.reason}</span>
                        {r.status === "PENDING" && <span>Refund requested; completion is not yet confirmed.</span>}
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
        <summary>Payment trace (for developers and judges)</summary>
        <p className="small muted" style={{ marginTop: "0.75rem" }}>
          Every PayPal call is saved as an operation with a stable request key, so repeating it can never charge twice. Provider: {paymentsConfigured() ? "PayPal sandbox" : "not configured"}.
        </p>
        <div className="table-wrap">
          <table className="trace">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Status</th>
                <th>Request key</th>
                <th>PayPal order</th>
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
    </div>
  );
}

function AgreementTab({ v, labels }: { v: MerchantJobView; labels: Record<string, string> }) {
  const shown = v.effective ?? v.pending ?? v.draft;
  if (!shown) return <div className="panel empty">No agreement yet.</div>;
  const status = shown === v.effective ? "Approved by the customer" : shown === v.pending ? "Waiting for the customer" : "Draft, not sent";
  return (
    <div className="panel">
      <div className="section-head">
        <h2>
          {shown === v.effective ? "Current agreement" : "Agreement"} R{shown.number}
        </h2>
        <span className="muted small">{status}</span>
      </div>
      <table>
        <tbody>
          {v.template.fields.map((f) => (
            <tr key={f.path}>
              <th scope="row" style={{ width: "35%" }}>
                {f.label}
              </th>
              <td>
                <ValueView value={shown.content.scope[f.path]} labels={labels} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{ marginTop: "1.25rem" }}>Price</h3>
      <table>
        <tbody>
          {shown.content.lineItems.map((i) => (
            <tr key={i.description}>
              <td>
                {i.description} × {i.quantity}
              </td>
              <td className="num">{money(i.quantity * i.unitPriceMinor)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Total</th>
            <td className="num">
              <strong>{money(shown.total_minor)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="small muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
        Published revisions can never be edited; changes create a new revision. <Link href={`/app/jobs/${v.job.id}/history`}>See every revision</Link>.
      </p>
    </div>
  );
}

function DiffTable({
  fields,
  before,
  after,
  domain,
  labels,
}: {
  fields: readonly { path: string; label: string }[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  domain: "apparel" | "website";
  labels: Record<string, string>;
}) {
  if (Object.keys(before).length === 0) {
    return (
      <table>
        <caption className="sr-only">Agreement terms</caption>
        <tbody>
          {fields.map((f) => (
            <tr key={f.path}>
              <th scope="row" style={{ width: "35%" }}>
                {f.label}
              </th>
              <td>
                <ValueView value={after[f.path] as never} labels={labels} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const diff = scopeDiff(domain, before as never, after as never);
  if (diff.length === 0) return <p className="muted small">The scope is unchanged; only price or terms differ.</p>;
  return (
    <table className="diff">
      <caption className="sr-only">Changed fields</caption>
      <thead>
        <tr>
          <th scope="col">What</th>
          <th scope="col">Now</th>
          <th scope="col">Proposed</th>
        </tr>
      </thead>
      <tbody>
        {diff.map((d) => (
          <tr key={d.path}>
            <th scope="row">{fields.find((f) => f.path === d.path)?.label ?? d.path}</th>
            <td className="old">
              <span className="sr-only">was </span>
              <del>
                <ValueView value={d.oldValue} labels={labels} />
              </del>
            </td>
            <td>
              <span className="sr-only">becomes </span>
              <ins>
                <ValueView value={d.newValue} labels={labels} />
              </ins>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
