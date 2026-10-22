import { createHash } from "node:crypto";
import { assertMinor, depositTarget, type Currency } from "./money";
export { formatScopeValue } from "./templates";
import {
  checkFieldValue,
  template,
  type CatalogEntry,
  type Domain,
  type LineItem,
  type Scope,
  type ScopeValue,
} from "./templates";

export const TERMS_VERSION = "pact-terms-v1";

export type RevisionStatus = "DRAFT" | "PUBLISHED" | "CUSTOMER_APPROVED" | "DECLINED" | "SUPERSEDED";

/** The immutable commercial content a customer sees and approves. */
export type RevisionContent = {
  domain: Domain;
  currency: Currency;
  scope: Scope;
  lineItems: LineItem[];
  totalMinor: number;
  depositBps: number;
  terms: {
    version: string;
    /** Disclosed: work is released only after the deposit for this revision is received. */
    activationRequiresDeposit: true;
    /** Disclosed: completed payments already received for this job count toward this revision. */
    creditsPriorPayments: true;
    merchantNote: string;
  };
};

export type FieldChange = { path: string; label: string; oldValue: ScopeValue; newValue: ScopeValue };

export function lineTotal(items: readonly LineItem[]): number {
  return items.reduce((sum, i) => sum + assertMinor(i.quantity, "quantity") * assertMinor(i.unitPriceMinor, "unit price"), 0);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function contentHash(content: RevisionContent): string {
  return createHash("sha256").update(canonical(content)).digest("hex");
}

export function buildContent(args: {
  domain: Domain;
  currency: Currency;
  scope: Scope;
  lineItems: LineItem[];
  depositBps: number;
  merchantNote?: string;
}): RevisionContent {
  const scope: Scope = {};
  for (const f of template(args.domain).fields) scope[f.path] = args.scope[f.path] ?? null;
  return {
    domain: args.domain,
    currency: args.currency,
    scope,
    lineItems: args.lineItems.map((i) => ({ ...i })),
    totalMinor: lineTotal(args.lineItems),
    depositBps: args.depositBps,
    terms: {
      version: TERMS_VERSION,
      activationRequiresDeposit: true,
      creditsPriorPayments: true,
      merchantNote: (args.merchantNote ?? "").slice(0, 1000),
    },
  };
}

/** Problems that prevent publishing. Empty means publishable. */
export function publishProblems(content: RevisionContent, catalog: { artwork: readonly CatalogEntry[] }): string[] {
  const t = template(content.domain);
  const problems: string[] = [];
  for (const f of t.fields) {
    const err = checkFieldValue(f, content.scope[f.path] ?? null, catalog);
    if (err) problems.push(err);
  }
  for (const key of Object.keys(content.scope)) {
    if (!t.fields.some((f) => f.path === key)) problems.push(`Unknown field ${key}`);
  }
  problems.push(...t.unresolved(content.scope));
  if (content.lineItems.length === 0) problems.push("At least one priced line item is required");
  for (const item of content.lineItems) {
    if (!item.description.trim()) problems.push("Every line item needs a description");
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) problems.push(`${item.description}: quantity must be positive`);
    if (!Number.isSafeInteger(item.unitPriceMinor) || item.unitPriceMinor < 0) problems.push(`${item.description}: invalid price`);
  }
  if (content.totalMinor !== lineTotal(content.lineItems)) problems.push("Total does not match line items");
  if (content.totalMinor <= 0) problems.push("Total must be greater than zero");
  if (!Number.isInteger(content.depositBps) || content.depositBps < 0 || content.depositBps > 10_000) {
    problems.push("Deposit percentage is invalid");
  }
  return problems;
}

export function scopeDiff(domain: Domain, before: Scope, after: Scope): FieldChange[] {
  return template(domain)
    .fields.filter((f) => canonical(before[f.path] ?? null) !== canonical(after[f.path] ?? null))
    .map((f) => ({ path: f.path, label: f.label, oldValue: before[f.path] ?? null, newValue: after[f.path] ?? null }));
}

export function applyPatch(scope: Scope, patch: Record<string, ScopeValue>): Scope {
  return { ...scope, ...patch };
}

export function revisionDeposit(content: RevisionContent): number {
  return depositTarget(content.totalMinor, content.depositBps);
}
