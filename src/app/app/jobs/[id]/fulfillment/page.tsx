import Link from "next/link";
import { fulfillmentSheet } from "@/application/fulfillment";
import { currentMerchant } from "@/server/http";
import { Badge } from "@/ui/Badge";
import { when } from "@/ui/format";
import { PrintButton } from "./PrintButton";

export default async function FulfillmentPage(props: PageProps<"/app/jobs/[id]/fulfillment">) {
  const { id } = await props.params;
  const s = await fulfillmentSheet(await currentMerchant(), id);
  return (
    <div className="sheet" style={{ maxWidth: 800 }}>
      <p className="no-print">
        <Link href={`/app/jobs/${id}`}>← Back to job</Link>
      </p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Job sheet: {s.job.title}</h1>
        <PrintButton />
      </div>
      {s.revision ? (
        <p>
          Authorized revision <strong>R{s.revision.number}</strong> (hash <code>{s.revision.contentHash.slice(0, 12)}</code>), approved {when(s.revision.approvedAt, s.job.timezone)}. Status{" "}
          <Badge status={s.job.state} />
        </p>
      ) : (
        <p className="notice warn">No approved agreement. Nothing on this sheet is authorized.</p>
      )}
      {!s.actionable && (
        <div className="notice warn" role="status">
          <p>
            <strong>Not released for work.</strong> Printed copies of earlier sheets are superseded; check this page before starting.
          </p>
          {s.blockers.length > 0 && <ul>{s.blockers.map((b) => <li key={b.code}>{b.message}</li>)}</ul>}
        </div>
      )}
      {s.actionable && s.blockers.length > 0 && (
        <div className="notice bad" role="status">
          <ul>{s.blockers.map((b) => <li key={b.code}>{b.message}</li>)}</ul>
        </div>
      )}
      <div className="panel">
        <h2>Specification</h2>
        <dl className="kv">
          {s.lines.map((l) => (
            <div key={l.label} style={{ display: "contents" }}>
              <dt>{l.label}</dt>
              <dd style={{ textAlign: "left" }}>
                {l.value}
                {l.attachmentId && (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, session-authorized file */}
                    <img src={`/api/attachments/${l.attachmentId}`} alt={`Artwork file: ${l.value}`} style={{ maxWidth: 240, maxHeight: 240, border: "1px solid var(--border)", marginTop: "0.4rem" }} />
                  </div>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="panel">
        <h2>Items</h2>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {s.items.map((i) => (
              <tr key={i.description}>
                <td>{i.description}</td>
                <td className="num">{i.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Prices and customer contact details are intentionally not shown on the job sheet.</p>
    </div>
  );
}
