"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { detailList, postJson } from "./api";

/** Posts to an action endpoint, announces the result, and refreshes server data. */
export function ActionButton({
  url,
  body,
  children,
  className,
  confirm,
  disabled,
  disabledReason,
}: {
  url: string;
  body?: unknown;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  return (
    <span className="stack" style={{ display: "inline-block" }}>
      <button
        type="button"
        className={className}
        disabled={busy || disabled}
        title={disabled ? disabledReason : undefined}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError(null);
          try {
            await postJson(url, body ?? {});
            router.refresh();
          } catch (err) {
            const e = err as Error & { details?: unknown };
            setError({ message: e.message, items: detailList(e.details) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {error && (
        <span role="alert" className="notice bad small" style={{ display: "block" }}>
          {error.message}
          {error.items.length > 0 && (
            <ul>
              {error.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </span>
      )}
    </span>
  );
}
