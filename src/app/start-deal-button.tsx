"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartDealButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/deals", { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Could not start a deal");
      setBusy(false);
      return;
    }
    router.push(`/deals/${body.id}`);
  }

  return (
    <div className="space-y-2">
      <button
        onClick={start}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {busy ? "Starting…" : "Start the tote-bag demo deal"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
