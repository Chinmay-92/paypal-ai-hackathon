"use client";

import type { LineItem } from "@/domain/templates";
import { money } from "./format";

/** Merchant-controlled prices. The model never sets these. */
export function LineItemsEditor({ items, onChange, idPrefix, onSuggest }: { items: LineItem[]; onChange: (items: LineItem[]) => void; idPrefix: string; onSuggest?: () => void }) {
  const update = (i: number, patch: Partial<LineItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const total = items.reduce((s, i) => s + i.quantity * i.unitPriceMinor, 0);
  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="num">
                Qty
              </th>
              <th scope="col" className="num">
                Unit price (USD)
              </th>
              <th scope="col" className="num">
                Amount
              </th>
              <th scope="col">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>
                  <label className="sr-only" htmlFor={`${idPrefix}-d${i}`}>
                    Description
                  </label>
                  <input id={`${idPrefix}-d${i}`} value={it.description} onChange={(e) => update(i, { description: e.target.value })} />
                </td>
                <td className="num" style={{ width: "6rem" }}>
                  <label className="sr-only" htmlFor={`${idPrefix}-q${i}`}>
                    Quantity
                  </label>
                  <input id={`${idPrefix}-q${i}`} type="number" min={1} value={it.quantity} onChange={(e) => update(i, { quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} />
                </td>
                <td className="num" style={{ width: "9rem" }}>
                  <label className="sr-only" htmlFor={`${idPrefix}-p${i}`}>
                    Unit price in dollars
                  </label>
                  <input
                    id={`${idPrefix}-p${i}`}
                    type="number"
                    min={0}
                    step="0.01"
                    // Committed on blur so typing "12." is not reformatted mid-edit.
                    key={`${i}-${it.unitPriceMinor}`}
                    defaultValue={(it.unitPriceMinor / 100).toFixed(2)}
                    onBlur={(e) => update(i, { unitPriceMinor: Math.max(0, Math.round(Number(e.target.value || 0) * 100)) })}
                  />
                </td>
                <td className="num">{money(it.quantity * it.unitPriceMinor)}</td>
                <td>
                  <button type="button" className="link" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${it.description}`}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Total
              </th>
              <td className="num">
                <strong>{money(total)}</strong>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="row" style={{ marginTop: "0.5rem" }}>
        <button type="button" onClick={() => onChange([...items, { code: "CUSTOM", description: "Additional item", quantity: 1, unitPriceMinor: 0 }])}>
          Add line
        </button>
        {onSuggest && (
          <button type="button" onClick={onSuggest}>
            Recalculate from rate card
          </button>
        )}
      </div>
    </div>
  );
}
