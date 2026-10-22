import type { Currency } from "@/domain/money";

export function money(minor: number, currency: Currency | string = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

export function when(value: Date | string | null | undefined, timeZone = "UTC"): string {
  if (!value) return "—";
  // dateStyle/timeStyle cannot be combined with timeZoneName, so fields are explicit.
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(new Date(value));
}

export function label(code: string): string {
  return code.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
