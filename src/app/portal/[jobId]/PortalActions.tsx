"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/ui/api";
import { money } from "@/ui/format";

export function Decision({ revisionId, contentHash, dueNowMinor }: { revisionId: string; contentHash: string; dueNowMinor: number }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<{ tone: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (action: "APPROVE" | "DECLINE") => {
    setBusy(true);
    setStatus(null);
    try {
      await postJson(`/api/reviews/${revisionId}/decision`, { action, contentHash, reason: reason || undefined });
      setStatus({ tone: "ok", text: action === "APPROVE" ? (dueNowMinor > 0 ? `Approved. You can now pay the ${money(dueNowMinor)} deposit.` : "Approved. No payment is due now.") : "Declined. Your earlier agreement stays in place." });
      router.refresh();
    } catch (err) {
      setStatus({ tone: "bad", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cta">
      <div aria-live="polite">{status && <p className={`notice ${status.tone}`}>{status.text}</p>}</div>
      {!declining ? (
        <>
          <button className="primary" type="button" disabled={busy} onClick={() => send("APPROVE")}>
            Approve this revision
          </button>
          <p className="small muted" style={{ margin: 0 }}>
            Approving does not charge you. Payment is a separate step.
          </p>
          <button type="button" disabled={busy} onClick={() => setDeclining(true)}>
            Decline
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send("DECLINE");
          }}
        >
          <label htmlFor="decline-reason">Why are you declining? (optional)</label>
          <textarea id="decline-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          <div className="cta" style={{ marginTop: "0.5rem" }}>
            <button className="danger" type="submit" disabled={busy}>
              Decline this revision
            </button>
            <button type="button" onClick={() => setDeclining(false)}>
              Back
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

type CheckoutResult = { kind: "redirect"; approveUrl: string; operationId: string } | { kind: "capture"; operationId: string } | { kind: "status"; message: string };

export function PayButton({ obligationId, amountMinor }: { obligationId: string; amountMinor: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="cta">
      <button
        className="primary"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            const r = await postJson<CheckoutResult>(`/api/obligations/${obligationId}/checkout`);
            if (r.kind === "redirect") {
              window.location.assign(r.approveUrl);
              return;
            }
            if (r.kind === "capture") {
              router.push(`${window.location.pathname}/paypal-return?op=${r.operationId}`);
              return;
            }
            setMessage(r.message);
          } catch (err) {
            setMessage((err as Error).message);
          }
          setBusy(false);
        }}
      >
        {busy ? "Opening PayPal…" : `Pay ${money(amountMinor)} with PayPal`}
      </button>
      <div aria-live="polite">{message && <p className="notice warn">{message}</p>}</div>
    </div>
  );
}

export function CheckStatus({ obligationId }: { obligationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await postJson(`/api/obligations/${obligationId}/reconcile`).catch(() => undefined);
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Checking…" : "Check payment status"}
    </button>
  );
}

export function AskQuestion() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await postJson("/api/portal/messages", { body });
          setBody("");
          setStatus("Sent to the business. Asking a question does not change your order.");
          router.refresh();
        } catch (err) {
          setStatus((err as Error).message);
        }
      }}
    >
      <h2>Ask a question or request a change</h2>
      <label htmlFor="q">Message to the business</label>
      <textarea id="q" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={4000} />
      <div aria-live="polite">{status && <p className="small">{status}</p>}</div>
      <button type="submit" style={{ marginTop: "0.5rem" }}>
        Send
      </button>
    </form>
  );
}
