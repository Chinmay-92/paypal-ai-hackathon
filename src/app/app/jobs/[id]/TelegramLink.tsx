"use client";

import { useState } from "react";
import { postJson } from "@/ui/api";

export function TelegramLink({ jobId }: { jobId: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section className="section">
    <h3>Receive a change on Telegram</h3>
    <p className="small muted">Create a private link for this job and share it with your customer. They open it, tap Start, and send their change as a text message. The bot does not send replies; check this job for their message. Anyone with the link can connect; creating a new link disconnects the old one.</p>
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError(""); setUrl("");
      try { const result = await postJson<{url: string}>(`/api/jobs/${jobId}/telegram`); setUrl(result.url); }
      catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    }}>{busy ? "Creating…" : "Create Telegram link"}</button>
    {url && <p className="notice"><a href={url} target="_blank" rel="noopener noreferrer">Open Telegram link</a><br /><span className="small">Copy this link and share it privately. It expires in 24 hours and can be used once.</span></p>}
    {error && <p className="notice bad" role="alert">{error}</p>}
  </section>;
}
