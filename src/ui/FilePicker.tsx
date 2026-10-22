"use client";

import { useState } from "react";

export type Uploaded = { id: string; filename: string; contentType: string };

/** Uploads one file to the given endpoint and reports it; type and size are re-checked on the server. */
export function FilePicker({ url, onUploaded, label = "Attach a file", id }: { url: string; onUploaded: (f: Uploaded) => void; label?: string; id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} <span className="hint">PNG, JPEG, WebP or PDF, up to 5 MB</span>
      </label>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        disabled={busy}
        onChange={async (e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            const body = new FormData();
            body.append("file", file);
            const res = await fetch(url, { method: "POST", body });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error ?? `Upload failed (${res.status})`);
            onUploaded(json as Uploaded);
            input.value = "";
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <p className="small" role="status">Uploading…</p>}
      {error && (
        <p className="small notice bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
