"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { TEMPLATES, type CatalogEntry, type Domain, type FieldDef, type LineItem, type RateCardEntry, type Scope } from "@/domain/templates";
import type { Proposal } from "@/integrations/ai/contract";
import { detailList, postJson } from "@/ui/api";
import { Badge } from "@/ui/Badge";
import { label } from "@/ui/format";
import { LineItemsEditor } from "@/ui/LineItemsEditor";
import { ScopeEditor } from "@/ui/ScopeEditor";
import { ValueView } from "@/ui/ValueView";

type Cr = { id: string; status: string; intent: string | null; extractor: string | null; issues: string[]; draftReply: string | null; baseRevisionId: string; createdAt: string };

const noSubscribe = () => () => {};

function readSaved(id: string): string | null {
  try {
    return window.localStorage.getItem(`pact-review-${id}`);
  } catch {
    return null;
  }
}

function writeSaved(id: string, value: { scope: Scope; items: LineItem[] } | null) {
  try {
    if (value) window.localStorage.setItem(`pact-review-${id}`, JSON.stringify(value));
    else window.localStorage.removeItem(`pact-review-${id}`);
  } catch {
    /* storage unavailable: review still works */
  }
}

export function ChangeReview(props: {
  jobId: string;
  version: number;
  cr: Cr;
  proposal: Proposal | null;
  baseScope: Scope;
  baseIsCurrent: boolean;
  fields: readonly FieldDef[];
  domain: Domain;
  rateCard: RateCardEntry[];
  artwork: CatalogEntry[];
  labels: Record<string, string>;
  depositBps: number;
  started: boolean;
  canEdit: boolean;
}) {
  const { cr, proposal, domain, rateCard } = props;
  const router = useRouter();
  const supported = proposal?.proposedChanges.filter((c) => c.supported) ?? [];
  const initialScope = { ...props.baseScope, ...Object.fromEntries(supported.map((c) => [c.field, c.proposedValue])) };
  const [scope, setScopeState] = useState<Scope>(initialScope);
  const [items, setItemsState] = useState<LineItem[]>(() => TEMPLATES[domain].suggestLineItems(initialScope, rateCard));
  const [deposit, setDeposit] = useState(props.depositBps / 100);
  const [note, setNote] = useState("");
  const [feasible, setFeasible] = useState(false);
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edited, setEdited] = useState(false);
  // In-progress review edits survive a refresh; the reviewer chooses to restore them.
  const saved = useSyncExternalStore(noSubscribe, () => readSaved(cr.id), () => null);
  const setScope = (next: Scope) => {
    setScopeState(next);
    setEdited(true);
    writeSaved(cr.id, { scope: next, items });
  };
  const setItems = (next: LineItem[]) => {
    setItemsState(next);
    setEdited(true);
    writeSaved(cr.id, { scope, items: next });
  };
  const restore = () => {
    try {
      const value = JSON.parse(saved ?? "") as { scope: Scope; items: LineItem[] };
      setScopeState(value.scope);
      setItemsState(value.items);
      setEdited(true);
    } catch {
      writeSaved(cr.id, null);
    }
  };

  if (cr.status === "ANALYZING") {
    return (
      <div className="panel" role="status">
        <h2>New message is being analyzed</h2>
        <p className="muted">The job is held for review. If the model is unavailable, the deterministic baseline runs instead.</p>
        <button type="button" onClick={() => router.refresh()}>
          Check again
        </button>
      </div>
    );
  }

  const submit = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/jobs/${props.jobId}/changes/${cr.id}/review`, { expectedVersion: props.version, ...body });
      writeSaved(cr.id, null);
      router.refresh();
    } catch (err) {
      const e = err as Error & { details?: unknown };
      setError({ message: e.message, items: detailList(e.details) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>
        Change request <Badge status={cr.status} /> {cr.intent && <span className="badge accent">{label(cr.intent)}</span>}
      </h2>
      <p className="small muted">
        Proposed by {cr.extractor?.startsWith("model:") ? `model (${cr.extractor.slice(6)})` : "deterministic baseline"}. A proposal is not a decision: you set prices and publish.
      </p>
      {!props.baseIsCurrent && <div className="notice warn">This request was analyzed against an earlier revision. Reject it or edit the agreement manually.</div>}
      <h3 className="review-step">1. Check what Pact found</h3>
      {proposal?.rationale && <p>{proposal.rationale}</p>}

      {proposal && proposal.proposedChanges.length > 0 && (
        <div className="table-wrap">
          <table className="diff">
            <caption className="sr-only">Proposed changes with citations</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Current</th>
                <th scope="col">Proposed</th>
                <th scope="col">Source quote</th>
              </tr>
            </thead>
            <tbody>
              {proposal.proposedChanges.map((c, i) => (
                <tr key={i}>
                  <th scope="row">{props.fields.find((f) => f.path === c.field)?.label ?? c.field}</th>
                  <td className="old">
                    <del>
                      <ValueView value={c.oldValue} labels={props.labels} />
                    </del>
                  </td>
                  <td className="new">
                    <ins>
                      <ValueView value={c.proposedValue} labels={props.labels} />
                    </ins>
                    {!c.supported && (
                      <div>
                        <Badge status="FAILED" text="Not supported" /> <span className="small">{c.issue}</span>
                      </div>
                    )}
                  </td>
                  <td className="small">
                    <q>{c.quotedSpan}</q>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(proposal?.missingInformation.length ?? 0) > 0 && (
        <div className="notice info">
          <p>Needs an answer before this can be published:</p>
          <ul>{proposal!.missingInformation.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {cr.issues.length > 0 && (
        <div className="notice warn">
          <p>Validation flagged parts of this proposal; they were not pre-filled:</p>
          <ul>{cr.issues.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {cr.draftReply && (
        <details>
          <summary>Suggested reply to the customer (not sent)</summary>
          <p className="small" style={{ whiteSpace: "pre-wrap" }}>
            {cr.draftReply}
          </p>
          <button type="button" onClick={() => navigator.clipboard?.writeText(cr.draftReply ?? "")}>
            Copy reply
          </button>
        </details>
      )}

      {props.canEdit && props.baseIsCurrent && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ decision: "accept", scope, lineItems: items, depositBps: Math.round(deposit * 100), confirmFeasibility: props.started ? feasible : undefined });
          }}
        >
          {saved && !edited && (
            <p className="notice info small">
              You have unsaved review edits from earlier.{" "}
              <button type="button" className="link" onClick={restore}>
                Restore them
              </button>
            </p>
          )}
          <h3 className="review-step">2. Fill in what&apos;s missing</h3>
          <p className="small muted">Proposed values are filled in. Anything marked unresolved must be answered before the customer can see it.</p>
          <ScopeEditor fields={props.fields} scope={scope} onChange={setScope} artwork={props.artwork} highlight={supported.map((c) => c.field)} idPrefix={`cr-${cr.id}`} />
          <h3 className="review-step">3. Set the price</h3>
          <p className="small muted">From your rate card. Pact never sets prices; change anything you need.</p>
          <LineItemsEditor items={items} onChange={setItems} idPrefix={`cr-li-${cr.id}`} onSuggest={() => setItems(TEMPLATES[domain].suggestLineItems(scope, rateCard))} />
          <div className="field" style={{ marginTop: "0.75rem", maxWidth: 240 }}>
            <label htmlFor={`dep-${cr.id}`}>Deposit (%)</label>
            <input id={`dep-${cr.id}`} type="number" min={0} max={100} value={deposit} onChange={(e) => setDeposit(Math.min(100, Math.max(0, Number(e.target.value))))} />
          </div>
          {props.started && (
            <div className="field">
              <label>
                <input type="checkbox" checked={feasible} onChange={(e) => setFeasible(e.target.checked)} /> Work has started. I confirm the shop can make this change.
              </label>
            </div>
          )}
          {error && (
            <div role="alert" className="notice bad">
              <p>{error.message}</p>
              {error.items.length > 0 && <ul>{error.items.map((i) => <li key={i}>{i}</li>)}</ul>}
            </div>
          )}
          <div className="row" style={{ marginTop: "0.5rem" }}>
            <button className="primary big" type="submit" disabled={busy}>
              Create draft revision
            </button>
            <span className="small muted">You will see the customer&apos;s view before anything is sent.</span>
          </div>
        </form>
      )}
      {props.canEdit && (
        <details className="section">
          <summary>Reject this request instead</summary>
        <form
          style={{ marginTop: "0.75rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ decision: "reject", note });
          }}
        >
          <div className="field">
            <label htmlFor={`note-${cr.id}`}>
              Reject with explanation <span className="hint">Required; recorded in history</span>
            </label>
            <input id={`note-${cr.id}`} value={note} onChange={(e) => setNote(e.target.value)} minLength={3} required />
          </div>
          <button className="danger" type="submit" disabled={busy}>
            Reject request
          </button>
        </form>
        </details>
      )}
      {!props.canEdit && <p className="small muted">Publish or discard the current draft before accepting another request.</p>}
    </div>
  );
}
