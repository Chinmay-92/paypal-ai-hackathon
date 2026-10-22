"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { postJson } from "@/ui/api";

export function ReturnStatus({ jobId, operationId }: { jobId: string; operationId: string }) {
  const [state, setState] = useState<{ status: string; message: string } | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    postJson<{ status: string; message: string }>(`/api/payment-operations/${operationId}/capture`)
      .then(setState)
      .catch((err: Error) => setState({ status: "ERROR", message: err.message }));
  }, [operationId]);
  const tone = !state ? "info" : state.status === "COMPLETED" ? "ok" : ["UNKNOWN", "PENDING", "PROCESSING"].includes(state.status) ? "warn" : "bad";
  return (
    <div>
      <p className={`notice ${tone}`} role="status" aria-live="polite">
        {state ? state.message : "Checking with PayPal. Do not pay again."}
      </p>
      <Link className="button" href={`/portal/${jobId}`}>
        Back to your order
      </Link>
    </div>
  );
}
