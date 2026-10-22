import { readFileSync, writeFileSync } from "node:fs";
import { MATERIAL_INTENTS, type ExtractionInput, type ExtractionResult } from "../src/integrations/ai/contract";
import { runBaseline } from "../src/integrations/ai/extract";
import { modelConfigured, modelExtract, modelId, PROMPT_VERSION } from "../src/integrations/ai/model";
import { validateModelProposal } from "../src/integrations/ai/validate";
import { TEMPLATES } from "../src/domain/templates";
import { APPAREL_ORIGINAL, WEBSITE_ORIGINAL } from "../src/server/demo";

// Runs the labeled synthetic cases through the deterministic baseline and, if
// configured, the model. Writes actual results; it does not assert targets.
type Case = { id: string; domain: "apparel" | "website"; message: string; expected_intent: string; requires_merchant_review: boolean };

async function main() {
  const cases = JSON.parse(readFileSync("fixtures/pact/ai-cases.json", "utf8")) as Case[];
  const useModel = modelConfigured() && !process.argv.includes("--baseline-only");
  const rows: Record<string, unknown>[] = [];
  const tally: Record<string, { correct: number; total: number; unsupported: number; confusion: Record<string, number> }> = {};
  for (const c of cases) {
    const input: ExtractionInput = {
      baseRevisionId: "rev-eval-base",
      domain: c.domain,
      scope: c.domain === "apparel" ? APPAREL_ORIGINAL() : WEBSITE_ORIGINAL(),
      catalog: TEMPLATES[c.domain].defaultCatalog,
      sources: [{ id: `msg-${c.id}`, authorLabel: "Customer (synthetic)", authorRole: "customer", body: c.message }],
    };
    const runs: [string, () => Promise<ExtractionResult>][] = [["baseline", async () => runBaseline(input)]];
    if (useModel) {
      runs.push([
        "model",
        async () => {
          const { raw, meta } = await modelExtract(input);
          const { proposal, issues } = validateModelProposal(raw, input);
          return { proposal, issues, extractor: `model:${meta.model}`, meta };
        },
      ]);
    }
    for (const [name, run] of runs) {
      const t = (tally[name] ??= { correct: 0, total: 0, unsupported: 0, confusion: {} });
      let r: ExtractionResult | null = null;
      let error: string | null = null;
      try {
        r = await run();
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      const intent = r?.proposal.intent ?? "error";
      t.total++;
      if (intent === c.expected_intent) t.correct++;
      if (r?.issues.length) t.unsupported++;
      const key = `${c.expected_intent} -> ${intent}`;
      t.confusion[key] = (t.confusion[key] ?? 0) + 1;
      rows.push({
        case: c.id,
        extractor: name,
        expected: c.expected_intent,
        actual: intent,
        correct: intent === c.expected_intent,
        wouldHold: MATERIAL_INTENTS.includes(intent as never),
        expectedReview: c.requires_merchant_review,
        changes: r?.proposal.proposedChanges.map((p) => `${p.field}=${JSON.stringify(p.proposedValue)}${p.supported ? "" : ` [unsupported: ${p.issue}]`}`) ?? [],
        missing: r?.proposal.missingInformation ?? [],
        issues: r?.issues ?? [],
        error,
        meta: r?.meta ?? null,
      });
      console.log(`${name.padEnd(8)} ${c.id.padEnd(18)} expected=${c.expected_intent.padEnd(15)} actual=${intent}${error ? ` ERROR ${error}` : ""}`);
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    note: "Synthetic fixture cases only (development set, not held-out). Not evidence of real-world performance.",
    promptVersion: PROMPT_VERSION,
    model: useModel ? modelId() : null,
    summary: Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, { ...v, intentAccuracy: `${v.correct}/${v.total}` }])),
    rows,
  };
  const out = process.argv.includes("--write") ? "reports/ai-eval-latest.json" : "reports/ai-eval-run.local.json";
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
