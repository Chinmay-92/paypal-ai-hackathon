import Link from "next/link";
import { merchantJobView } from "@/application/jobs";
import { currentMerchant } from "@/server/http";
import { Badge } from "@/ui/Badge";
import { label, money, when } from "@/ui/format";

const SOURCE: Record<string, string> = { merchant: "Business user", customer: "Customer (review session)", system: "System", provider: "PayPal (verified with provider)" };

export default async function HistoryPage(props: PageProps<"/app/jobs/[id]/history">) {
  const { id } = await props.params;
  const v = await merchantJobView(await currentMerchant(), id);
  const tz = v.job.timezone;
  return (
    <>
      <Link className="back" href={`/app/jobs/${id}`}>
        ← {v.job.title}
      </Link>
      <h1>History</h1>
      <div className="panel">
        <h2>Revisions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Revision</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th>Published</th>
                <th>Decided</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {v.revisions.map((r) => (
                <tr key={r.id}>
                  <td>R{r.number}</td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  <td className="num">{money(r.total_minor)}</td>
                  <td>{when(r.published_at, tz)}</td>
                  <td>{when(r.decided_at, tz)}</td>
                  <td>
                    <code>{r.content_hash.slice(0, 12)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">An approval stays true for the revision it was given to, even after that revision is superseded.</p>
      </div>
      <div className="panel">
        <h2>Timeline</h2>
        <p className="small muted">Append-only. System-observed events are separated from user-supplied correspondence, which is never treated as proof of authorship.</p>
        <ol className="timeline">
          {v.events.map((e) => (
            <li key={e.id}>
              <span className="small muted">{when(e.created_at, tz)}</span>
              <span>
                <strong>{label(e.action.replace(".", " — "))}</strong> <span className="badge">{SOURCE[e.actor_type] ?? e.actor_type}</span>
                <div className="small muted mono" style={{ wordBreak: "break-word" }}>
                  {Object.entries(e.details)
                    .filter(([k]) => !["note"].includes(k))
                    .map(([k, val]) => `${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`)
                    .join(" · ")}
                </div>
                {typeof e.details.note === "string" && <div className="small">Note: {e.details.note}</div>}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
