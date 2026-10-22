import { label } from "./format";

const TONE: Record<string, { tone: string; icon: string }> = {
  COMPLETED: { tone: "ok", icon: "✓" },
  CUSTOMER_APPROVED: { tone: "ok", icon: "✓" },
  READY: { tone: "ok", icon: "✓" },
  ACCEPTED: { tone: "ok", icon: "✓" },
  NOT_REQUIRED: { tone: "ok", icon: "✓" },
  SUCCEEDED: { tone: "ok", icon: "✓" },
  IN_PROGRESS: { tone: "info", icon: "▶" },
  PUBLISHED: { tone: "info", icon: "◷" },
  PROCESSING: { tone: "info", icon: "◷" },
  ANALYZING: { tone: "info", icon: "◷" },
  DRAFT: { tone: "", icon: "✎" },
  DUE: { tone: "warn", icon: "!" },
  HOLD: { tone: "warn", icon: "‖" },
  NEEDS_REVIEW: { tone: "warn", icon: "!" },
  PENDING: { tone: "warn", icon: "◷" },
  RESERVED: { tone: "warn", icon: "◷" },
  UNKNOWN: { tone: "bad", icon: "?" },
  REVIEW_REQUIRED: { tone: "bad", icon: "!" },
  EXCEPTION: { tone: "bad", icon: "!" },
  FAILED: { tone: "bad", icon: "✕" },
  DECLINED: { tone: "bad", icon: "✕" },
  REJECTED: { tone: "", icon: "✕" },
  SUPERSEDED: { tone: "", icon: "↺" },
  CANCELLED: { tone: "", icon: "↺" },
  PARTIALLY_REFUNDED: { tone: "info", icon: "↩" },
  REFUNDED: { tone: "info", icon: "↩" },
  NO_CHANGE: { tone: "", icon: "–" },
};

/** Status shown with text and an icon, never colour alone. */
export function Badge({ status, text }: { status: string; text?: string }) {
  const t = TONE[status] ?? { tone: "", icon: "•" };
  return (
    <span className={`badge ${t.tone}`}>
      <span aria-hidden="true">{t.icon}</span>
      {text ?? label(status)}
    </span>
  );
}
