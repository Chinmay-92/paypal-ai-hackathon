"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TEMPLATES, type CatalogEntry, type Domain, type FieldDef, type LineItem, type RateCardEntry, type Scope } from "@/domain/templates";
import { detailList, postJson } from "@/ui/api";
import { LineItemsEditor } from "@/ui/LineItemsEditor";
import { ScopeEditor } from "@/ui/ScopeEditor";

/** Manual revision path; works with no model at all. Same publish and payment safeguards. */
export function ManualAmendment(props: {
  jobId: string;
  version: number;
  fields: readonly FieldDef[];
  domain: Domain;
  baseScope: Scope;
  baseItems: LineItem[];
  rateCard: RateCardEntry[];
  artwork: CatalogEntry[];
  depositBps: number;
  started: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>(props.baseScope);
  const [items, setItems] = useState<LineItem[]>(props.baseItems);
  const [deposit, setDeposit] = useState(props.depositBps / 100);
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  if (!open) {
    return (
      <div className="panel">
        <button type="button" onClick={() => setOpen(true)}>
          Edit the agreement manually
        </button>
      </div>
    );
  }
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await postJson(`/api/jobs/${props.jobId}/revisions`, { expectedVersion: props.version, scope, lineItems: items, depositBps: Math.round(deposit * 100) });
          setOpen(false);
          router.refresh();
        } catch (err) {
          const e2 = err as Error & { details?: unknown };
          setError({ message: e2.message, items: detailList(e2.details) });
        }
      }}
    >
      <h2>Manual amendment</h2>
      <ScopeEditor fields={props.fields} scope={scope} onChange={setScope} artwork={props.artwork} idPrefix="manual" />
      <LineItemsEditor items={items} onChange={setItems} idPrefix="manual-li" onSuggest={() => setItems(TEMPLATES[props.domain].suggestLineItems(scope, props.rateCard))} />
      <div className="field" style={{ marginTop: "0.75rem", maxWidth: 240 }}>
        <label htmlFor="manual-dep">Deposit (%)</label>
        <input id="manual-dep" type="number" min={0} max={100} value={deposit} onChange={(e) => setDeposit(Math.min(100, Math.max(0, Number(e.target.value))))} />
      </div>
      {error && (
        <div role="alert" className="notice bad">
          <p>{error.message}</p>
          {error.items.length > 0 && <ul>{error.items.map((i) => <li key={i}>{i}</li>)}</ul>}
        </div>
      )}
      <div className="row">
        <button className="primary" type="submit">
          Create draft revision
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
