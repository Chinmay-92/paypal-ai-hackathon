"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { detailList, postJson } from "@/ui/api";

function ErrorBox({ error }: { error: { message: string; items: string[] } | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="notice bad small">
      <p>{error.message}</p>
      {error.items.length > 0 && <ul>{error.items.map((i) => <li key={i}>{i}</li>)}</ul>}
    </div>
  );
}

function toError(err: unknown) {
  const e = err as Error & { details?: unknown };
  return { message: e.message, items: detailList(e.details) };
}

/** Shows the review link once, with a drafted message the merchant sends themselves. */
function LinkResult({ url, customerName, title, onDone }: { url: string; customerName?: string; title?: string; onDone?: () => void }) {
  const message = `Hi ${customerName ?? "there"}, the updated terms for "${title ?? "your order"}" are ready. Please review and approve or decline here: ${url}`;
  return (
    <div className="notice ok" role="status">
      <p>
        Review link created. Pact does not send it for you. Copy it into your usual channel:
      </p>
      <p className="mono" style={{ wordBreak: "break-all" }}>
        {url}
      </p>
      <div className="row">
        <button type="button" onClick={() => navigator.clipboard?.writeText(url)}>
          Copy link
        </button>
        <button type="button" onClick={() => navigator.clipboard?.writeText(message)}>
          Copy drafted message
        </button>
        {onDone && (
          <button type="button" className="primary" onClick={onDone}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}

export function PublishDraft(props: { jobId: string; revisionId: string; version: number; started: boolean; disabled: boolean; customerName: string; title: string }) {
  const router = useRouter();
  const [feasible, setFeasible] = useState(false);
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      {props.started && (
        <label>
          <input type="checkbox" checked={feasible} onChange={(e) => setFeasible(e.target.checked)} /> Work has started. I confirm the shop can make this change.
        </label>
      )}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={props.disabled || busy || url !== null}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await postJson<{ reviewUrl: string }>(`/api/jobs/${props.jobId}/revisions/${props.revisionId}/publish`, { expectedVersion: props.version, confirmFeasibility: props.started ? feasible : undefined });
              // Keep the link on screen; refreshing now would unmount this draft panel.
              setUrl(res.reviewUrl);
            } catch (err) {
              setError(toError(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Publish to customer
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setError(null);
            try {
              await postJson(`/api/jobs/${props.jobId}/revisions/${props.revisionId}/discard`, { expectedVersion: props.version });
              router.refresh();
            } catch (err) {
              setError(toError(err));
            }
          }}
        >
          Discard draft
        </button>
      </div>
      <ErrorBox error={error} />
      {url && <LinkResult url={url} customerName={props.customerName} title={props.title} onDone={() => router.refresh()} />}
    </div>
  );
}

export function ReissueLink({ jobId }: { jobId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  return (
    <div className="stack">
      <button
        type="button"
        onClick={async () => {
          try {
            setUrl((await postJson<{ reviewUrl: string }>(`/api/jobs/${jobId}/invitations`)).reviewUrl);
          } catch (err) {
            setError(toError(err));
          }
        }}
      >
        Create a new review link
      </button>
      <ErrorBox error={error} />
      {url && <LinkResult url={url} />}
    </div>
  );
}

export function HoldForm({ jobId, version, holdReason }: { jobId: string; version: number; holdReason: string | null }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  const send = async (value: string | null) => {
    setError(null);
    try {
      await postJson(`/api/jobs/${jobId}/hold`, { expectedVersion: version, reason: value });
      setReason("");
      router.refresh();
    } catch (err) {
      setError(toError(err));
    }
  };
  if (holdReason) {
    return (
      <div className="row" style={{ marginTop: "0.75rem" }}>
        <span className="small">Manual hold: {holdReason}</span>
        <button type="button" onClick={() => send(null)}>
          Clear hold
        </button>
        <ErrorBox error={error} />
      </div>
    );
  }
  return (
    <form
      style={{ marginTop: "0.75rem" }}
      onSubmit={(e) => {
        e.preventDefault();
        void send(reason);
      }}
    >
      <label htmlFor="hold">Place a manual hold</label>
      <div className="row">
        <input id="hold" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" minLength={3} required style={{ flex: 1 }} />
        <button type="submit">Hold</button>
      </div>
      <ErrorBox error={error} />
    </form>
  );
}

export function RefundForm({ captureId }: { captureId: string }) {
  const router = useRouter();
  // One key per form instance: a double-submit or retry cannot refund twice.
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Refund this payment…
      </button>
    );
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setError(null);
        try {
          await postJson(`/api/captures/${captureId}/refunds`, {
            amountMinor: Math.round(Number(data.get("amount")) * 100),
            reason: data.get("reason"),
            operationKey,
          });
          setOperationKey(crypto.randomUUID());
          setOpen(false);
          router.refresh();
        } catch (err) {
          setError(toError(err));
        }
      }}
    >
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`ra-${captureId}`}>Refund amount (USD)</label>
          <input id={`ra-${captureId}`} name="amount" type="number" min="0.01" step="0.01" required />
        </div>
        <div className="field">
          <label htmlFor={`rr-${captureId}`}>Reason shown to customer</label>
          <input id={`rr-${captureId}`} name="reason" required minLength={3} maxLength={255} />
        </div>
      </div>
      <p className="small muted">You decide refunds. A submitted refund is not the same as money arriving; Pact tracks pending and completed separately.</p>
      <div className="row">
        <button className="danger" type="submit">
          Submit refund
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <ErrorBox error={error} />
    </form>
  );
}
