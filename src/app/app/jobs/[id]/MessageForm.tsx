"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/ui/api";
import { FilePicker, type Uploaded } from "@/ui/FilePicker";

export function MessageForm({ jobId, customerName }: { jobId: string; customerName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<Uploaded[]>([]);
  return (
    <form
      style={{ marginTop: "1rem" }}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        setError(null);
        try {
          await postJson(`/api/jobs/${jobId}/messages`, {
            authorLabel: data.get("author"),
            authorRole: data.get("role"),
            sentAtLabel: data.get("sentAt") || undefined,
            body: data.get("body"),
            attachmentIds: files.map((f) => f.id),
          });
          form.reset();
          setFiles([]);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Add correspondence</h3>
      <p className="small muted">Paste one message. It is stored as untrusted data and analyzed for a proposed change.</p>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="author">Author</label>
          <input id="author" name="author" required defaultValue={customerName} />
        </div>
        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" name="role" defaultValue="customer">
            <option value="customer">Customer</option>
            <option value="merchant">Business</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="sentAt">
          Stated time <span className="hint">Optional, as written in the original thread</span>
        </label>
        <input id="sentAt" name="sentAt" maxLength={60} />
      </div>
      <div className="field">
        <label htmlFor="body">Message</label>
        <textarea id="body" name="body" required maxLength={8000} />
      </div>
      <FilePicker id={`msg-file-${jobId}`} url={`/api/jobs/${jobId}/attachments`} label="Files sent with this message" onUploaded={(f) => setFiles((x) => [...x, f])} />
      {files.length > 0 && (
        <ul className="small">
          {files.map((f) => (
            <li key={f.id}>
              {f.filename}{" "}
              <button type="button" className="link" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="notice bad">
          {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Analyzing…" : "Add and analyze"}
      </button>
    </form>
  );
}
