import { formatScopeValue, type ScopeValue } from "@/domain/templates";

/** Displays a scope value; uploaded artwork ("att:<id>") shows its name and a private thumbnail. */
export function ValueView({ value, labels }: { value: ScopeValue | undefined; labels?: Record<string, string> }) {
  const text = formatScopeValue(value, labels);
  if (typeof value === "string" && value.startsWith("att:")) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- private, session-authorized file */}
        <img src={`/api/attachments/${value.slice(4)}`} alt={`Artwork: ${text}`} width={40} height={40} style={{ objectFit: "contain", border: "1px solid var(--border)", borderRadius: 4, background: "#fff" }} />
        {text}
      </span>
    );
  }
  return <>{text}</>;
}

export function labelsOf(artwork: readonly { id: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(artwork.map((a) => [a.id, a.label]));
}
