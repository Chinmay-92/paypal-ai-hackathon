import Link from "next/link";
import { listJobs, type JobListItem } from "@/application/jobs";
import { currentMerchant } from "@/server/http";
import { Badge } from "@/ui/Badge";
import { money } from "@/ui/format";

const FILTERS: { key: JobListItem["filter"] | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs_review", label: "Needs review" },
  { key: "awaiting_customer", label: "Awaiting customer" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "ready", label: "Ready" },
  { key: "in_progress", label: "In progress" },
  { key: "exception", label: "Exception" },
];

export default async function JobsPage(props: PageProps<"/app/jobs">) {
  const { filter = "all" } = (await props.searchParams) as { filter?: string };
  const jobs = await listJobs(await currentMerchant());
  const shown = filter === "all" ? jobs : jobs.filter((j) => j.filter === filter);
  return (
    <>
      <h1>Jobs</h1>
      <nav className="filters" aria-label="Filter jobs">
        {FILTERS.map((f) => (
          <Link key={f.key} href={f.key === "all" ? "/app/jobs" : `/app/jobs?filter=${f.key}`} aria-current={filter === f.key ? "page" : undefined}>
            {f.label} ({f.key === "all" ? jobs.length : jobs.filter((j) => j.filter === f.key).length})
          </Link>
        ))}
      </nav>
      <div className="panel table-wrap">
        {shown.length === 0 ? (
          <p className="muted">No jobs in this view.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Customer</th>
                <th scope="col">Revision</th>
                <th scope="col">Requests</th>
                <th scope="col" className="num">
                  Payment due
                </th>
                <th scope="col">Work</th>
                <th scope="col">Next</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((j) => (
                <tr key={j.id}>
                  <td>
                    <Link href={`/app/jobs/${j.id}`}>{j.title}</Link>
                    <div className="muted small">{j.domain === "apparel" ? "Custom apparel" : "Website project"}</div>
                  </td>
                  <td>{j.customerName}</td>
                  <td>
                    {j.currentRevision ? `R${j.currentRevision}` : "—"}
                    {j.pendingRevision && <div className="small">R{j.pendingRevision} proposed</div>}
                  </td>
                  <td>{j.openRequests > 0 ? <Badge status="NEEDS_REVIEW" text={`${j.openRequests} to review`} /> : <span className="muted">None</span>}</td>
                  <td className="num">
                    {j.dueMinor > 0 ? money(j.dueMinor) : "—"}
                    {j.unsettledPayments > 0 && <div><Badge status="UNKNOWN" text="Checking payment" /></div>}
                    {j.reviewPayments > 0 && <div><Badge status="REVIEW_REQUIRED" text="Payment review" /></div>}
                  </td>
                  <td>
                    <Badge status={j.fulfillmentState} />
                  </td>
                  <td className="small">{j.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
