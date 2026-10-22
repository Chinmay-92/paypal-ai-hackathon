"use client";

import Link from "next/link";
import { useState } from "react";
import { postJson } from "@/ui/api";

type Demo = { ownerEmail: string; teamEmail: string; password: string; jobs: { jobId: string; title: string; reviewUrl: string }[] };

export function DemoLauncher() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!demo) {
    return (
      <div className="stack">
        {error && (
          <p role="alert" className="notice bad">
            {error}
          </p>
        )}
        <button
          className="primary"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              setDemo(await postJson<Demo>("/api/demo"));
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? "Creating your workspace…" : "Create my demo workspace"}
        </button>
      </div>
    );
  }
  return (
    <div className="stack" role="status">
      <div className="panel">
        <h2>Your workspace is ready</h2>
        <p>You are signed in as the business owner. Suggested walkthrough:</p>
        <ol>
          <li>Open a customer link below in a private window (or on your phone). Approve the agreement and pay the deposit with a sandbox buyer.</li>
          <li>Back here, open the job and paste a change, e.g. “Make ten of those hoodies instead. Use the attached logo on everything.”</li>
          <li>Review the cited proposal, fill in what&apos;s missing, publish, and send the new link to the customer.</li>
          <li>Approve and pay the top-up as the customer, then release work and open the job sheet.</li>
        </ol>
      </div>
      {demo.jobs.map((j) => (
        <div className="panel" key={j.jobId}>
          <h3>{j.title}</h3>
          <div className="row">
            <Link className="button primary" href={`/app/jobs/${j.jobId}`}>
              Open as business owner
            </Link>
            <button type="button" onClick={() => navigator.clipboard?.writeText(j.reviewUrl)}>
              Copy customer link
            </button>
          </div>
          <p className="mono small" style={{ wordBreak: "break-all", marginTop: "0.5rem" }}>
            Customer link: {j.reviewUrl}
          </p>
        </div>
      ))}
      <details className="panel">
        <summary>Sign-in details for this workspace</summary>
        <p className="small">
          Owner: <code>{demo.ownerEmail}</code>
          <br />
          Fulfillment team: <code>{demo.teamEmail}</code>
          <br />
          Password: <code>{demo.password}</code>
        </p>
        <p className="small muted">Shown once. Synthetic accounts for this demo workspace only.</p>
      </details>
    </div>
  );
}
