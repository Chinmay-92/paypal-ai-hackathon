import { sha256 } from "@/application/tokens";
import { baselineExtract } from "./baseline";
import type { ExtractionInput, ExtractionResult } from "./contract";
import { modelConfigured, modelExtract, ModelUnavailableError, PROMPT_VERSION } from "./model";
import { validateModelProposal, validateProposal } from "./validate";

export function inputHash(input: ExtractionInput): string {
  return sha256(JSON.stringify({ b: input.baseRevisionId, s: input.scope, m: input.sources.map((s) => [s.id, s.body]) }));
}

export function runBaseline(input: ExtractionInput, meta: Record<string, unknown> = {}): ExtractionResult {
  const started = Date.now();
  const { proposal, issues } = validateProposal(baselineExtract(input), input);
  return { proposal, issues, extractor: "baseline", meta: { ...meta, inputHash: inputHash(input), latencyMs: Date.now() - started } };
}

/**
 * Model first, deterministic baseline on model failure. Either way the result
 * is only a proposal; its validation issues travel with it to merchant review.
 */
export async function extractProposal(input: ExtractionInput): Promise<ExtractionResult> {
  if (!modelConfigured()) return runBaseline(input, { reason: "model not configured" });
  try {
    const { raw, meta } = await modelExtract(input);
    const { proposal, issues } = validateModelProposal(raw, input);
    return { proposal, issues, extractor: `model:${meta.model}`, meta: { ...meta, inputHash: inputHash(input) } };
  } catch (err) {
    if (!(err instanceof ModelUnavailableError)) throw err;
    return runBaseline(input, { reason: "model unavailable", modelError: err.message, promptVersion: PROMPT_VERSION });
  }
}
