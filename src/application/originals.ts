import type { z } from "zod";
import { template, type Scope } from "@/domain/templates";
import { extractProposal } from "@/integrations/ai/extract";
import { pool } from "@/persistence/db";
import { loadCatalog } from "@/persistence/repo";
import { requireOwner, type MerchantActor } from "./actors";
import type { ExtractOriginalInput } from "./schemas";

/**
 * Proposes an original agreement from a pasted quote or thread. Writes
 * nothing: the merchant reviews the cited values in the new-job form and saves
 * a draft, which then goes through the normal publish checks.
 */
export async function extractOriginalAgreement(actor: MerchantActor, input: z.infer<typeof ExtractOriginalInput>) {
  requireOwner(actor);
  const t = template(input.domain);
  const empty: Scope = Object.fromEntries(t.fields.map((f) => [f.path, null]));
  const catalog = await loadCatalog(pool(), actor.tenantId, input.domain);
  const result = await extractProposal({
    mode: "original",
    baseRevisionId: "new-agreement",
    domain: input.domain,
    scope: empty,
    catalog,
    sources: [{ id: "pasted-quote", authorLabel: "Pasted by merchant", authorRole: "merchant", body: input.text }],
  });
  const supported = result.proposal.proposedChanges.filter((c) => c.supported);
  return {
    scope: { ...empty, ...Object.fromEntries(supported.map((c) => [c.field, c.proposedValue])) },
    citations: result.proposal.proposedChanges.map((c) => ({ field: c.field, value: c.proposedValue, quotedSpan: c.quotedSpan, supported: c.supported, issue: c.issue ?? null })),
    missingInformation: result.proposal.missingInformation,
    issues: result.issues,
    extractor: result.extractor,
  };
}
