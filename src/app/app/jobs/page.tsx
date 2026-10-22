import Link from "next/link";
import { listJobs, type JobListItem } from "@/application/jobs";
import { currentMerchant } from "@/server/http";
import { Badge } from "@/ui/Badge";
import { money } from "@/ui/format";

const GROUPS: { key: string; title: string; hint: string; filters: JobListItem["filter"][] }[] = [
  { key: "you", title: "Needs you", hint: "Review a change, publish a revision or decide on a payment.", filters: ["needs_review", "exception", "draft"] },
  { key: "others", title: "Waiting on others", hint: "The customer is reviewing or paying, or PayPal is confirming.", filters: ["awaiting_customer", "awaiting_payment"] },
  { key: "team", title: "With the team", hint: "Released work and production.", filters: ["ready", "in_progress"] },
  { key: "done", title: "Completed", hint: "", filters: ["completed"] },
];

function stateBadge(j: JobListItem) {
  if (j.reviewPayments > 0) return <Badge status="REVIEW_REQUIRED" text="Payment to review" />;
  if (j.unsettledPayments > 0) return <Badge status="UNKNOWN" text="Confirming payment" />;
  if (j.openRequests > 0) return <Badge status="NEEDS_REVIEW" text={j.openRequests === 1 ? "1 change to review" : `${j.openRequests} changes to review`} />;
  if (j.pendingRevision) return <Badge status="PUBLISHED" text={`R${j.pendingRevision} with customer`} />;
  return <Badge status={j.fulfillmentState} />;
}

export default async function JobsPage() {
  const actor = await currentMerchant();
  const jobs = await listJobs(actor);
  const youCount = jobs.filter((j) => GROUPS[0].filters.includes(j.filter)).length;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p className="muted" style={{ margin: 0 }}>
            {jobs.length === 0 ? "No jobs yet." : youCount === 0 ? "Nothing needs you right now." : youCount === 1 ? "1 job needs you." : `${youCount} jobs need you.`}
          </p>
        </div>
        {actor.role === "owner" && (
          <Link className="button primary" href="/app/jobs/new">
            New job
          </Link>
        )}
      </div>
      {jobs.length === 0 && (
        <div className="panel empty">
          <h2>Start with your first job</h2>
          <p>Enter the agreed scope or paste the quote you sent. Pact keeps every later change, approval and payment in line with it.</p>
          {actor.role === "owner" && (
            <Link className="button primary" href="/app/jobs/new">
              Create a job
            </Link>
          )}
        </div>
      )}
      {GROUPS.map((g) => {
        const rows = jobs.filter((j) => g.filters.includes(j.filter));
        if (rows.length === 0) return null;
        return (
          <section key={g.key} className="job-group" aria-labelledby={`g-${g.key}`}>
            <h2 id={`g-${g.key}`}>
              {g.title} <span className="badge">{rows.length}</span>
            </h2>
            {g.hint && <p className="muted small">{g.hint}</p>}
            <div className="job-rows">
              {rows.map((j) => (
                <Link key={j.id} href={`/app/jobs/${j.id}`} className="job-row">
                  <div>
                    <div className="title">{j.title}</div>
                    <div className="meta">
                      {j.customerName}, {j.domain === "apparel" ? "custom apparel" : "website project"}
                      {j.currentRevision ? `, agreement R${j.currentRevision}` : ""}
                    </div>
                  </div>
                  <div className="next">{j.next}</div>
                  <div className="side">
                    {stateBadge(j)}
                    {j.dueMinor > 0 && <span className="small muted">{money(j.dueMinor)} due</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
