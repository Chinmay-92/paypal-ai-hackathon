"use client";

import type { CatalogEntry, FieldDef, Scope, ScopeValue } from "@/domain/templates";

/** Edits a domain scope. "Unresolved" is an explicit state, never a silent default. */
export function ScopeEditor({
  fields,
  scope,
  onChange,
  artwork,
  highlight = [],
  idPrefix,
}: {
  fields: readonly FieldDef[];
  scope: Scope;
  onChange: (scope: Scope) => void;
  artwork: readonly CatalogEntry[];
  highlight?: string[];
  idPrefix: string;
}) {
  const set = (path: string, value: ScopeValue) => onChange({ ...scope, [path]: value });
  return (
    <div className="grid-2">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.path}`;
        const value = scope[f.path] ?? null;
        const changed = highlight.includes(f.path);
        const unresolved = value === null;
        return (
          <div className="field" key={f.path} style={f.type === "sizes" || f.type === "text" ? { gridColumn: "1 / -1" } : undefined}>
            <label htmlFor={id}>
              {f.label} {changed && <span className="badge accent">Proposed</span>}{" "}
              {unresolved && <span className="badge warn">Unresolved</span>}
            </label>
            {f.type === "int" && (
              <input id={id} type="number" min={0} inputMode="numeric" value={value === null ? "" : String(value)} onChange={(e) => set(f.path, e.target.value === "" ? null : Math.max(0, Math.trunc(Number(e.target.value))))} />
            )}
            {f.type === "text" && <textarea id={id} value={(value as string | null) ?? ""} onChange={(e) => set(f.path, e.target.value === "" ? null : e.target.value)} />}
            {f.type === "date" && <input id={id} type="date" value={(value as string | null) ?? ""} onChange={(e) => set(f.path, e.target.value || null)} />}
            {f.type === "bool" && (
              <select id={id} value={value === null ? "" : String(value)} onChange={(e) => set(f.path, e.target.value === "" ? null : e.target.value === "true")}>
                <option value="">Unresolved</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            )}
            {f.type === "catalog" && (
              <select id={id} value={(value as string | null) ?? ""} onChange={(e) => set(f.path, e.target.value || null)}>
                <option value="">Unresolved</option>
                {artwork.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.id})
                  </option>
                ))}
              </select>
            )}
            {f.type === "sizes" && (
              <fieldset id={id} style={{ border: "none", padding: 0, margin: 0 }}>
                <legend className="sr-only">{f.label}</legend>
                <div className="row">
                  {(f.sizes ?? []).map((size) => {
                    const sizes = (value as Record<string, number> | null) ?? null;
                    return (
                      <span key={size} style={{ width: "5.5rem" }}>
                        <label htmlFor={`${id}-${size}`} className="small">
                          {size}
                        </label>
                        <input
                          id={`${id}-${size}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={sizes?.[size] === undefined ? "" : String(sizes[size])}
                          placeholder="—"
                          onChange={(e) => {
                            const next = { ...(sizes ?? {}) };
                            if (e.target.value === "") delete next[size];
                            else next[size] = Math.max(0, Math.trunc(Number(e.target.value)));
                            set(f.path, next);
                          }}
                        />
                      </span>
                    );
                  })}
                  <button type="button" className="link small" onClick={() => set(f.path, null)}>
                    Mark unresolved
                  </button>
                </div>
                <SizeTotal sizes={value as Record<string, number> | null} quantity={f.quantityField ? scope[f.quantityField] : undefined} />
              </fieldset>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Live check that a size breakdown adds up to its quantity, announced to screen readers. */
function SizeTotal({ sizes, quantity }: { sizes: Record<string, number> | null; quantity: ScopeValue | undefined }) {
  if (sizes === null) return null;
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  const target = typeof quantity === "number" ? quantity : null;
  const ok = target === null || total === target;
  return (
    <p className="small" aria-live="polite" style={{ margin: "0.3rem 0 0" }}>
      <span className={`badge ${ok ? "ok" : "warn"}`}>
        <span aria-hidden="true">{ok ? "✓" : "!"}</span>
        Sizes total {total}
        {target !== null && ` of ${target}`}
      </span>
      {!ok && target !== null && <span> {total < target ? `${target - total} still to assign` : `${total - target} too many`}</span>}
    </p>
  );
}
