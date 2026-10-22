"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TEMPLATES, type Domain, type LineItem, type Scope } from "@/domain/templates";
import type { Catalog } from "@/persistence/repo";
import { detailList, postJson } from "@/ui/api";
import { LineItemsEditor } from "@/ui/LineItemsEditor";
import { ScopeEditor } from "@/ui/ScopeEditor";

function emptyScope(domain: Domain): Scope {
  return Object.fromEntries(TEMPLATES[domain].fields.map((f) => [f.path, null]));
}

export function NewJobForm({ catalogs }: { catalogs: Record<Domain, Catalog> }) {
  const router = useRouter();
  const [domain, setDomain] = useState<Domain>("apparel");
  const [scope, setScope] = useState<Scope>(emptyScope("apparel"));
  const [items, setItems] = useState<LineItem[]>([]);
  const [deposit, setDeposit] = useState(50);
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const suggest = () => setItems(TEMPLATES[domain].suggestLineItems(scope, catalogs[domain].rateCard));

  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          const res = await postJson<{ jobId: string }>("/api/jobs", {
            domain,
            title: data.get("title"),
            customer: { name: data.get("customerName"), email: data.get("customerEmail") },
            scope,
            lineItems: items,
            depositBps: Math.round(deposit * 100),
            merchantNote: data.get("note") || undefined,
          });
          router.push(`/app/jobs/${res.jobId}`);
        } catch (err) {
          const e2 = err as Error & { details?: unknown };
          setError({ message: e2.message, items: detailList(e2.details) });
          setBusy(false);
        }
      }}
    >
      {error && (
        <div role="alert" className="notice bad">
          <p>{error.message}</p>
          {error.items.length > 0 && <ul>{error.items.map((i) => <li key={i}>{i}</li>)}</ul>}
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label htmlFor="domain">Template</label>
          <select
            id="domain"
            value={domain}
            onChange={(e) => {
              const d = e.target.value as Domain;
              setDomain(d);
              setScope(emptyScope(d));
              setItems([]);
            }}
          >
            <option value="apparel">Custom apparel</option>
            <option value="website">Website project</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="title">Job title</label>
          <input id="title" name="title" required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="customerName">Customer name</label>
          <input id="customerName" name="customerName" required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="customerEmail">Customer email</label>
          <input id="customerEmail" name="customerEmail" type="email" required />
        </div>
      </div>
      <h2>Scope</h2>
      <ScopeEditor fields={TEMPLATES[domain].fields} scope={scope} onChange={setScope} artwork={catalogs[domain].artwork} idPrefix="new" />
      <h2>Price</h2>
      <p className="muted small">Prices come from your rate card and can be changed. Currency: USD.</p>
      <LineItemsEditor items={items} onChange={setItems} idPrefix="new-li" onSuggest={suggest} />
      <div className="grid-2" style={{ marginTop: "1rem" }}>
        <div className="field">
          <label htmlFor="deposit">
            Deposit (% of total) <span className="hint">Rounded half-up to the cent</span>
          </label>
          <input id="deposit" type="number" min={0} max={100} value={deposit} onChange={(e) => setDeposit(Math.min(100, Math.max(0, Number(e.target.value))))} />
        </div>
        <div className="field">
          <label htmlFor="note">Note to customer (optional)</label>
          <input id="note" name="note" maxLength={1000} />
        </div>
      </div>
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save draft agreement"}
      </button>
    </form>
  );
}
