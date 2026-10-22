import { checkFieldValue, fieldDef, type ScopeValue } from "@/domain/templates";
import { MATERIAL_INTENTS, type ExtractionInput, type ModelProposal, type Proposal, type ProposedChange } from "./contract";

function sameValue(a: ScopeValue, b: ScopeValue): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function decode(json: string): { ok: true; value: ScopeValue } | { ok: false } {
  try {
    const value = JSON.parse(json) as unknown;
    if (value === null || ["number", "boolean", "string"].includes(typeof value)) return { ok: true, value: value as ScopeValue };
    if (typeof value === "object" && !Array.isArray(value)) return { ok: true, value: value as ScopeValue };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Checks a proposal against the authoritative base and the supplied sources.
 * Citations must be literal spans of a supplied message; values must fit the
 * domain schema and merchant catalog; oldValue must match the base revision.
 * Failures route the proposal to manual review; nothing here executes anything.
 */
export function validateProposal(
  raw: Omit<Proposal, "proposedChanges"> & { proposedChanges: Omit<ProposedChange, "supported" | "issue">[] },
  input: ExtractionInput,
): { proposal: Proposal; issues: string[] } {
  const issues: string[] = [];
  if (raw.baseRevisionId !== input.baseRevisionId) issues.push("Proposal refers to a different base revision");
  const sources = new Map(input.sources.map((s) => [s.id, s]));
  const changes: ProposedChange[] = raw.proposedChanges.map((c) => {
    const fail = (issue: string): ProposedChange => {
      issues.push(`${c.field}: ${issue}`);
      return { ...c, supported: false, issue };
    };
    const def = fieldDef(input.domain, c.field);
    if (!def) return fail("unknown field");
    const source = sources.get(c.sourceId);
    if (!source) return fail("cites a message that was not supplied");
    if (!c.quotedSpan.trim() || !source.body.includes(c.quotedSpan)) return fail("quote is not a literal span of the cited message");
    if (!sameValue(c.oldValue, input.scope[c.field] ?? null)) return fail("old value does not match the current agreement");
    const typeError = checkFieldValue(def, c.proposedValue, input.catalog);
    if (typeError) return fail(typeError);
    if (sameValue(c.oldValue, c.proposedValue) && c.proposedValue !== null) return fail("proposes no change");
    return { ...c, supported: true };
  });
  let proposedChanges = changes;
  if (!MATERIAL_INTENTS.includes(raw.intent) && changes.length > 0) {
    issues.push(`A ${raw.intent.replace("_", " ")} message cannot change the agreement; proposed changes were dropped`);
    proposedChanges = [];
  }
  const seen = new Set<string>();
  for (const c of proposedChanges) {
    if (seen.has(c.field)) issues.push(`${c.field}: proposed more than once`);
    seen.add(c.field);
  }
  return { proposal: { ...raw, proposedChanges }, issues };
}

/** Decodes the model's JSON-string values, then validates. */
export function validateModelProposal(raw: ModelProposal, input: ExtractionInput): { proposal: Proposal; issues: string[] } {
  const decodeIssues: string[] = [];
  const changes = raw.proposedChanges.flatMap((c) => {
    const oldV = decode(c.oldValueJson);
    const newV = decode(c.proposedValueJson);
    if (!oldV.ok || !newV.ok) {
      decodeIssues.push(`${c.field}: value is not valid JSON`);
      return [];
    }
    return [{ field: c.field, oldValue: oldV.value, proposedValue: newV.value, sourceId: c.sourceId, quotedSpan: c.quotedSpan }];
  });
  const result = validateProposal(
    {
      baseRevisionId: raw.baseRevisionId,
      intent: raw.intent,
      proposedChanges: changes,
      missingInformation: raw.missingInformation,
      affectedApprovals: raw.affectedApprovals,
      rationale: raw.rationale,
      draftReply: raw.draftReply,
    },
    input,
  );
  return { proposal: result.proposal, issues: [...decodeIssues, ...result.issues] };
}
