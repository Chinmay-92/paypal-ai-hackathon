import { portalView } from "@/application/reviews";
import { ValueView } from "@/ui/ValueView";
import { paymentsConfigured } from "@/integrations/paypal/http";
import { currentCustomer } from "@/server/http";
import { Badge } from "@/ui/Badge";
import { label, money, when } from "@/ui/format";
import { AskQuestion, CheckStatus, Decision, PayButton } from "./PortalActions";

export default async function PortalPage(props: PageProps<"/portal/[jobId]">) {
  const { jobId } = await props.params;
  const { checkout } = (await props.searchParams) as { checkout?: string };
  const actor = await currentCustomer().catch(() => null);
  if (!actor || actor.jobId !== jobId) {
    return (
      <div className="portal">
        <main id="main">
          <h1>Open your review link</h1>
          <p>This page needs the review link the business sent you. Links expire; ask the business for a new one if needed.</p>
        </main>
      </div>
    );
  }
  const v = await portalView(actor);
  const tz = v.job.timezone;
  const fields = v.template.fields;
  return (
    <div className="portal">
      <header className="topbar">
        <span className="brand">{v.merchant.name}</span>
        <span className="sandbox-flag">Sandbox demo · no real money</span>
      </header>
      <main id="main" className="stack">
        <div>
          <h1>{v.job.title}</h1>
          <p className="muted small">
            For {v.customerName}. Amounts in {v.job.currency}. Times in {tz}.
          </p>
        </div>
        {v.linkReplaced && <div className="notice warn">This proposal has been replaced. Review the current version.</div>}
        {checkout === "cancelled" && <div className="notice info">You left PayPal without paying. Nothing was charged.</div>}
        {v.job.startedAt && v.pending && <div className="notice warn">Work has started. The shop must confirm whether this change is possible.</div>}

        {v.pending && v.pendingTerms && (
          <section className="panel" aria-labelledby="proposal-h">
            <h2 id="proposal-h">
              {v.effective ? `Proposed change: revision ${v.pending.number}` : `Agreement for review: revision ${v.pending.number}`}
            </h2>
            {v.effective ? (
              v.diff.length > 0 ? (
                <table className="diff">
                  <caption className="sr-only">What changes</caption>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Now</th>
                      <th scope="col">Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.diff.map((d) => (
                      <tr key={d.path}>
                        <th scope="row">{d.label}</th>
                        <td className="old">
                          <span className="sr-only">currently </span>
                          <del>
                            <ValueView value={d.oldValue} labels={v.artworkLabels} />
                          </del>
                        </td>
                        <td className="new">
                          <span className="sr-only">changes to </span>
                          <ins>
                            <ValueView value={d.newValue} labels={v.artworkLabels} />
                          </ins>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>The scope is unchanged; the price or terms changed.</p>
              )
            ) : (
              <dl className="kv">
                {fields.map((f) => (
                  <div key={f.path} style={{ display: "contents" }}>
                    <dt>{f.label}</dt>
                    <dd>
                      <ValueView value={v.pending!.content.scope[f.path]} labels={v.artworkLabels} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <h3 style={{ marginTop: "1rem" }}>Price</h3>
            <table>
              <tbody>
                {v.pending.content.lineItems.map((i) => (
                  <tr key={i.description}>
                    <td>
                      {i.description} × {i.quantity}
                    </td>
                    <td className="num">{money(i.quantity * i.unitPriceMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="kv" style={{ marginTop: "0.75rem" }}>
              <dt>New total</dt>
              <dd>
                {money(v.pendingTerms.totalMinor)} {v.effective && <span className="muted small">(was {money(v.effective.total_minor)})</span>}
              </dd>
              <dt>Deposit required ({v.pending.content.depositBps / 100}%)</dt>
              <dd>{money(v.pendingTerms.depositTargetMinor)}</dd>
              <dt>Already paid</dt>
              <dd>{money(v.pendingTerms.previouslyPaidMinor)}</dd>
              <dt className="strong">Due after you approve</dt>
              <dd className="strong">{money(v.pendingTerms.dueNowMinor)}</dd>
              <dt>Remaining balance later</dt>
              <dd>{money(v.pendingTerms.remainingAfterDepositMinor)}</dd>
            </dl>
            {v.pending.content.terms.merchantNote && <p className="small">Note from the business: {v.pending.content.terms.merchantNote}</p>}
            <p className="small muted">
              Terms {v.pending.content.terms.version}: work starts only after the deposit for this revision is received. Payments already received for this job count toward it. Approving records
              your decision on this exact revision; it is not a qualified electronic signature and does not waive your legal rights.
            </p>
            <Decision revisionId={v.pending.id} contentHash={v.pending.content_hash} dueNowMinor={v.pendingTerms.dueNowMinor} />
          </section>
        )}

        {v.obligations.length > 0 && (
          <section className="panel" aria-labelledby="pay-h">
            <h2 id="pay-h">Payment</h2>
            {v.obligations.map((o) => (
              <div key={o.id} className="stack">
                <p>
                  {label(o.purpose)}: <strong>{money(o.amount_minor)}</strong> <Badge status={o.status} />
                </p>
                {o.status === "UNKNOWN" && <p role="status">We are checking the payment result. Do not pay again yet.</p>}
                {o.status === "PENDING" && <p role="status">Payment is pending. Work has not been released.</p>}
                {["DUE", "PROCESSING", "FAILED"].includes(o.status) &&
                  (paymentsConfigured() ? <PayButton obligationId={o.id} amountMinor={o.amount_minor} /> : <p className="notice warn">Payments are not configured on this demo server.</p>)}
                {["UNKNOWN", "PENDING", "PROCESSING"].includes(o.status) && <CheckStatus obligationId={o.id} />}
              </div>
            ))}
            <p className="small muted">Each payment is a separate PayPal checkout you approve yourself. Nothing is charged automatically.</p>
          </section>
        )}
        {v.reviewPayments.length > 0 && (
          <div className="notice warn">A payment you made arrived after the proposal was replaced. The business will review it with you; it has been recorded and not lost.</div>
        )}

        {v.effective && (
          <section className="panel">
            <h2>
              Current agreement: revision {v.effective.number} <Badge status="CUSTOMER_APPROVED" text="Approved" />
            </h2>
            <dl className="kv">
              {fields.map((f) => (
                <div key={f.path} style={{ display: "contents" }}>
                  <dt>{f.label}</dt>
                  <dd>
                    <ValueView value={v.effective!.content.scope[f.path]} labels={v.artworkLabels} />
                  </dd>
                </div>
              ))}
              <dt>Total</dt>
              <dd>{money(v.effective.total_minor)}</dd>
              <dt>Paid so far</dt>
              <dd>{money(v.creditedMinor)}</dd>
            </dl>
            <p className="small muted">Approved {when(v.effective.decided_at, tz)}.</p>
          </section>
        )}

        <AskQuestion />
      </main>
    </div>
  );
}
