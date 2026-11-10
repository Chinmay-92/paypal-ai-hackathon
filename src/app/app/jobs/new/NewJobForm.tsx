"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatScopeValue, TEMPLATES, type Domain, type LineItem, type Scope, type ScopeValue } from "@/domain/templates";
import type { Catalog } from "@/persistence/repo";
import { detailList, postJson } from "@/ui/api";
import { LineItemsEditor } from "@/ui/LineItemsEditor";
import { ScopeEditor } from "@/ui/ScopeEditor";

type Extracted = {
  scope: Scope;
  citations: { field: string; value: ScopeValue; quotedSpan: string; supported: boolean; issue: string | null }[];
  missingInformation: string[];
  issues: string[];
  extractor: string;
};

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
  const [quote, setQuote] = useState("");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const extract = async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await postJson<Extracted>("/api/jobs/extract-original", { domain, text: quote });
      setExtracted(res);
      setScope(res.scope);
      setItems(TEMPLATES[domain].suggestLineItems(res.scope, catalogs[domain].rateCard));
    } catch (err) {
      setExtractError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  };
  const fieldLabel = (path: string) => TEMPLATES[domain].fields.find((f) => f.path === path)?.label ?? path;

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
      <h2>1. Job and customer</h2>
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
              setExtracted(null);
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
      <h2 style={{ marginTop: "1.5rem" }}>2. What was agreed</h2>
      <section className="quote-start" aria-labelledby="quote-h">
        <h2 id="quote-h">Start from the quote you sent (optional)</h2>
        <p className="small muted">Paste the quote or conversation you agreed on. Pact will suggest details and show where it found them. Check each field before saving; prices come from your rate card.</p>
        <div className="field">
          <label htmlFor="quote">Pasted text</label>
          <textarea id="quote" value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={8000} />
        </div>
        <button type="button" className="primary" onClick={extract} disabled={extracting || quote.trim().length < 10}>
          {extracting ? "Reading…" : "Suggest agreement details"}
        </button>
        {extractError && (
          <p role="alert" className="notice bad small">
            {extractError}
          </p>
        )}
        {extracted && (
          <div className="stack" role="status" style={{ marginTop: "0.75rem" }}>
            <p className="small">
              Suggested by {extracted.extractor.startsWith("model:") ? `AI model ${extracted.extractor.slice(6)}` : "Pact’s rules-based fallback"}. Check the details below; nothing has been saved yet.
            </p>
            {extracted.citations.length > 0 && (
              <table className="small">
                <thead>
                  <tr>
                    <th scope="col">Field</th>
                    <th scope="col">Proposed</th>
                    <th scope="col">From your text</th>
                  </tr>
                </thead>
                <tbody>
                  {extracted.citations.map((c, i) => (
                    <tr key={i}>
                      <td>{fieldLabel(c.field)}</td>
                      <td>
                        {formatScopeValue(c.value)}
                        {!c.supported && <div className="badge bad">Not used: {c.issue}</div>}
                      </td>
                      <td>
                        <q>{c.quotedSpan}</q>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {extracted.missingInformation.length > 0 && (
              <div className="notice info small">
                <p>Still to confirm:</p>
                <ul>{extracted.missingInformation.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </section>

      <ScopeEditor
        fields={TEMPLATES[domain].fields}
        scope={scope}
        onChange={setScope}
        artwork={catalogs[domain].artwork}
        highlight={extracted?.citations.filter((c) => c.supported).map((c) => c.field) ?? []}
        idPrefix="new"
        showUnresolved={extracted !== null}
      />
      <h2 style={{ marginTop: "1.5rem" }}>3. Price</h2>
      <p className="muted small">Prices come from your rate card and can be changed. Currency: USD.</p>
      <LineItemsEditor items={items} onChange={setItems} idPrefix="new-li" onSuggest={suggest} />
      <div className="grid-2" style={{ marginTop: "1rem" }}>
        <div className="field">
          <label htmlFor="deposit">
            Deposit (% of total) <span className="hint">Rounded to the nearest cent</span>
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
