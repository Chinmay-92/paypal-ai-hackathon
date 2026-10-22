import { z } from "zod";
import type { CatalogEntry, Domain, Scope, ScopeValue } from "@/domain/templates";

export const INTENTS = ["question", "change_request", "cancellation", "approval_like", "irrelevant", "uncertain"] as const;
export type Intent = (typeof INTENTS)[number];

/** Material intents put the job on review hold; the others leave scope untouched. */
export const MATERIAL_INTENTS: readonly Intent[] = ["change_request", "cancellation", "uncertain"];

/**
 * What the model must return. Values are JSON-encoded strings so the schema
 * stays simple for structured output; they are decoded and type-checked after.
 */
export const ModelProposal = z.object({
  baseRevisionId: z.string(),
  intent: z.enum(INTENTS),
  proposedChanges: z
    .array(
      z.object({
        field: z.string(),
        oldValueJson: z.string(),
        /** JSON for the new value, or the literal string "null" when the value is unresolved. */
        proposedValueJson: z.string(),
        sourceId: z.string(),
        quotedSpan: z.string(),
      }),
    )
    .max(20),
  missingInformation: z.array(z.string()).max(10),
  affectedApprovals: z.array(z.string()).max(10),
  rationale: z.string(),
  draftReply: z.string(),
});
export type ModelProposal = z.infer<typeof ModelProposal>;

export type ProposedChange = {
  field: string;
  oldValue: ScopeValue;
  proposedValue: ScopeValue;
  sourceId: string;
  quotedSpan: string;
  /** False when the change failed validation; unsupported changes are shown but never pre-filled. */
  supported: boolean;
  issue?: string;
};

export type Proposal = {
  baseRevisionId: string;
  intent: Intent;
  proposedChanges: ProposedChange[];
  missingInformation: string[];
  affectedApprovals: string[];
  rationale: string;
  draftReply: string;
};

export type SourceForExtraction = { id: string; authorLabel: string; authorRole: string; body: string };

export type ExtractionInput = {
  baseRevisionId: string;
  domain: Domain;
  scope: Scope;
  catalog: { artwork: readonly CatalogEntry[] };
  sources: SourceForExtraction[];
};

export type ExtractionResult = {
  proposal: Proposal;
  issues: string[];
  extractor: string;
  meta: Record<string, unknown>;
};
