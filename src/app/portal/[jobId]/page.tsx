import { portalView } from "@/application/reviews";
import { paymentsConfigured } from "@/integrations/paypal/http";
import { currentCustomer } from "@/server/http";
import { Badge } from "@/ui/Badge";
import { Brand } from "@/ui/Brand";
import { label, money, when } from "@/ui/format";
import { ValueView } from "@/ui/ValueView";
import { AskQuestion, CheckStatus, Decision, PayButton } from "./PortalActions";

export default async function PortalPage(props: PageProps<"/portal/[jobId]">) {
  const { jobId } = await props.params;
  const { checkout } = (await props.searchParams) as { checkout?: string };
  const actor = await currentCustomer().catch(() => null);
  if (!actor || actor.jobId !== jobId) {
    return (
      <div className="portal">
        <main id="main" className="narrow">
          <h1>Open your review link</h1>
          <p>Open the review link the business shared with you. If it has expired, ask them for a new one.</p>
        </main>
      </div>
    );
  }
  const v = await portalView(actor);
  const tz = v.job.timezone;
  const fields = v.template.fields;
  const payable = v.obligations.find((o) => ["DUE", "PROCESSING", "FAILED"].includes(o.status));
  const checking = v.obligations.find((o) => ["UNKNOWN", "PENDING"].includes(o.status));
  const firstName = v.customerName.replace(/\s*\(synthetic\)/, "").split(" ")[0];
  const needsPaymentAfter = (v.pendingTerms?.dueNowMinor ?? 0) > 0;

  return (
    <div className="portal">
      <header className="topbar">
        <Brand href={null} name={v.merchant.name.replace(/\s*\(synthetic demo\)/, "")} />
        <span className="spacer" />
        <span className="sandbox-flag">Sandbox demo, no real money</span>
      </header>
      <main id="main">
        <p className="muted small" style={{ marginBottom: "0.25rem" }}>
          {v.job.title}
        </p>

        {v.linkReplaced && <div className="notice warn">There’s a newer version of this agreement. Please review it below.</div>}
        {checkout === "cancelled" && <div className="notice info">You left PayPal without paying. Nothing was charged.</div>}

        {v.pending && v.pendingTerms ? (
          <section aria-labelledby="proposal-h">
            <p className="portal-step">{needsPaymentAfter ? "Step 1 of 2" : "Your decision"}</p>
            <h1 id="proposal-h">{v.effective ? `Review the change to your order` : `Review your agreement`}</h1>
            <p className="muted">
              Hi {firstName}. {v.effective ? `${v.merchant.name.replace(/\s*\(synthetic demo\)/, "")} has updated the agreement. Here is exactly what changes.` : "Please check the details and price."}
            </p>
            {v.job.startedAt && <div className="notice warn">Work has started. The shop must confirm whether this change is possible.</div>}
            <div className="panel">
              {v.effective ? (
                v.diff.length > 0 ? (
                  <table className="diff">
                    <caption className="sr-only">What changes</caption>
                    <thead>
                      <tr>
                        <th scope="col">What</th>
                        <th scope="col">Now</th>
                        <th scope="col">New</th>
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
                          <td>
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
                  <p>The order details haven’t changed, but the price or terms have.</p>
                )
              ) : (
                <table>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f.path}>
                        <th scope="row">{f.label}</th>
                        <td>
                          <ValueView value={v.pending!.content.scope[f.path]} labels={v.artworkLabels} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="section">
                <h2>Price</h2>
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
                  <dt>{v.effective ? "New total" : "Total"}</dt>
                  <dd>
                    {money(v.pendingTerms.totalMinor)}
                    {v.effective && <span className="muted small"> (was {money(v.effective.total_minor)})</span>}
                  </dd>
                  <dt>Deposit ({v.pending.content.depositBps / 100}%)</dt>
                  <dd>{money(v.pendingTerms.depositTargetMinor)}</dd>
                  <dt>Already paid</dt>
                  <dd>{money(v.pendingTerms.previouslyPaidMinor)}</dd>
                  <span className="rule" />
                  <dt className="strong">To pay after you approve</dt>
                  <dd className="strong">{money(v.pendingTerms.dueNowMinor)}</dd>
                  <dt>Remaining balance</dt>
                  <dd>{money(v.pendingTerms.remainingAfterDepositMinor)}</dd>
                </dl>
                {v.pending.content.terms.merchantNote && <p className="small" style={{ marginTop: "0.75rem" }}>Note from the business: {v.pending.content.terms.merchantNote}</p>}
              </div>

              <div className="section">
                <Decision revisionId={v.pending.id} contentHash={v.pending.content_hash} dueNowMinor={v.pendingTerms.dueNowMinor} isChange={v.effective !== null} />
                <p className="small muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                  Work starts only after the deposit for this version is received. Payments you have already made count toward it. Approving records your decision on this exact version; it is not a
                  legal signature and does not affect your consumer rights.
                </p>
              </div>
            </div>
          </section>
        ) : payable ? (
          <section aria-labelledby="pay-h">
            <p className="portal-step">{v.decisions.length > 1 || v.creditedMinor > 0 ? "Step 2 of 2" : "Last step"}</p>
            <h1 id="pay-h">Pay your {label(payable.purpose).toLowerCase()}</h1>
            <div className="panel">
              <p className="money-big">{money(payable.amount_minor)}</p>
              <p className="muted">
                {payable.purpose === "BALANCE" ? "This is the remaining balance for your order." : "The business can release the work once the payment is confirmed and the other requirements are met."} You’ll approve the payment on PayPal. Nothing is charged automatically.
              </p>
              {paymentsConfigured() ? <PayButton obligationId={payable.id} amountMinor={payable.amount_minor} /> : <p className="notice warn">Payments are not configured on this demo server.</p>}
              {payable.status === "PROCESSING" && (
                <div style={{ marginTop: "0.75rem" }}>
                  <CheckStatus obligationId={payable.id} />
                </div>
              )}
            </div>
          </section>
        ) : checking ? (
          <section>
            <p className="portal-step">Payment</p>
            <h1>We are confirming your payment</h1>
            <div className="panel">
              <p role="status">{checking.status === "PENDING" ? "Payment is pending at PayPal. Work has not been released yet." : "We are checking the payment result. Do not pay again yet."}</p>
              <CheckStatus obligationId={checking.id} />
            </div>
          </section>
        ) : (
          <section>
            <p className="portal-step">All set</p>
            <h1>You’re all caught up</h1>
            <p className="muted">
              {v.job.fulfillmentState === "IN_PROGRESS" ? "Your order is in production." : v.job.fulfillmentState === "COMPLETED" ? "Your order is complete." : "The business has everything it needs. We'll show any new step here."}
            </p>
          </section>
        )}

        {v.reviewPayments.length > 0 && (
          <div className="notice warn">A payment arrived after the agreement was replaced. It has been recorded, and the business will review what to do with it.</div>
        )}

        {v.effective && (
          <details className="panel">
            <summary>
              Your current agreement (version {v.effective.number}) <Badge status="CUSTOMER_APPROVED" text="Approved" />
            </summary>
            <table style={{ marginTop: "0.75rem" }}>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.path}>
                    <th scope="row">{f.label}</th>
                    <td>
                      <ValueView value={v.effective!.content.scope[f.path]} labels={v.artworkLabels} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Total</th>
                  <td>{money(v.effective.total_minor)}</td>
                </tr>
                <tr>
                  <th scope="row">Paid so far</th>
                  <td>{money(v.creditedMinor)}</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted" style={{ margin: "0.75rem 0 0" }}>
              Approved {when(v.effective.decided_at, tz)}. Amounts in {v.job.currency}.
            </p>
          </details>
        )}

        <AskQuestion />
      </main>
    </div>
  );
}
