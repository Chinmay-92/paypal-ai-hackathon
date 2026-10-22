import { readFileSync, writeFileSync } from "node:fs";
import { MATERIAL_INTENTS, type ExtractionInput, type ExtractionResult } from "../src/integrations/ai/contract";
import { runBaseline } from "../src/integrations/ai/extract";
import { fallbackModelId, modelConfigured, modelExtract, modelId, PROMPT_VERSION } from "../src/integrations/ai/model";
import { validateModelProposal } from "../src/integrations/ai/validate";
import { TEMPLATES, type ScopeValue } from "../src/domain/templates";
import { APPAREL_ORIGINAL, WEBSITE_ORIGINAL } from "../src/server/demo";

// Runs the labeled synthetic cases through the deterministic baseline and, if
// configured, the model. Reports actual results per split; it asserts nothing.
// The held-out split must never be used to tune prompts or rules.
type Case = {
  id: string;
  domain: "apparel" | "website";
  split: "dev" | "heldout";
  message: string;
  expected_intent: string;
  expected_changes?: Record<string, ScopeValue>;
};

type Tally = { correct: number; total: number; errors: number; expectedFields: number; proposedFields: number; matchedFields: number; confusion: Record<string, number> };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function main() {
  const cases = JSON.parse(readFileSync("fixtures/pact/ai-cases.json", "utf8")) as Case[];
  const useModel = modelConfigured() && !process.argv.includes("--baseline-only");
  // Free-tier model quotas are per minute; pace model calls with e.g. --delay=7000.
  const delayMs = Number(process.argv.find((a) => a.startsWith("--delay="))?.slice(8) ?? 0);
  const rows: Record<string, unknown>[] = [];
  const tally: Record<string, Tally> = {};
  for (const c of cases) {
    const input: ExtractionInput = {
      baseRevisionId: "rev-eval-base",
      domain: c.domain,
      scope: c.domain === "apparel" ? { ...APPAREL_ORIGINAL(), delivery_date: "2026-11-30" } : { ...WEBSITE_ORIGINAL(), target_date: "2026-12-15" },
      catalog: TEMPLATES[c.domain].defaultCatalog,
      sources: [{ id: `msg-${c.id}`, authorLabel: "Customer (synthetic)", authorRole: "customer", body: c.message }],
    };
    const runs: [string, () => Promise<ExtractionResult>][] = [["baseline", async () => runBaseline(input)]];
    if (useModel) {
      runs.push([
        "model",
        async () => {
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
          const { raw, meta } = await modelExtract(input);
          const { proposal, issues } = validateModelProposal(raw, input);
          return { proposal, issues, extractor: `model:${meta.model}`, meta };
        },
      ]);
    }
    for (const [name, run] of runs) {
      const t = (tally[`${name}/${c.split}`] ??= { correct: 0, total: 0, errors: 0, expectedFields: 0, proposedFields: 0, matchedFields: 0, confusion: {} });
      let r: ExtractionResult | null = null;
      let error: string | null = null;
      try {
        r = await run();
      } catch (err) {
        error = err instanceof Error ? err.message.slice(0, 200) : String(err);
      }
      const intent = r?.proposal.intent ?? "error";
      t.total++;
      if (error) t.errors++;
      if (intent === c.expected_intent) t.correct++;
      t.confusion[`${c.expected_intent} -> ${intent}`] = (t.confusion[`${c.expected_intent} -> ${intent}`] ?? 0) + 1;
      const supported = r?.proposal.proposedChanges.filter((p) => p.supported) ?? [];
      let fieldResult: string | null = null;
      if (c.expected_changes && !error) {
        const expected = Object.entries(c.expected_changes);
        const matched = expected.filter(([f, v]) => supported.some((p) => p.field === f && same(p.proposedValue, v))).length;
        // Precision only counts fields the case labels or proposals that change something labeled cases did not expect.
        t.expectedFields += expected.length;
        t.proposedFields += supported.length;
        t.matchedFields += matched;
        fieldResult = `${matched}/${expected.length} expected, ${supported.length} proposed`;
      }
      rows.push({
        case: c.id,
        split: c.split,
        extractor: name,
        expected: c.expected_intent,
        actual: intent,
        correct: intent === c.expected_intent,
        wouldHold: MATERIAL_INTENTS.includes(intent as never),
        fields: fieldResult,
        changes: r?.proposal.proposedChanges.map((p) => `${p.field}=${JSON.stringify(p.proposedValue)}${p.supported ? "" : ` [unsupported: ${p.issue}]`}`) ?? [],
        missing: r?.proposal.missingInformation ?? [],
        issues: r?.issues ?? [],
        error,
        meta: r?.meta ?? null,
      });
      console.log(`${name.padEnd(8)} ${c.split.padEnd(7)} ${c.id.padEnd(24)} expected=${c.expected_intent.padEnd(15)} actual=${intent}${fieldResult ? ` fields ${fieldResult}` : ""}${error ? ` ERROR ${error.slice(0, 80)}` : ""}`);
    }
  }
  const summary = Object.fromEntries(
    Object.entries(tally).map(([k, v]) => [
      k,
      {
        intentAccuracy: `${v.correct}/${v.total}`,
        providerErrors: v.errors,
        intentAccuracyExcludingErrors: v.total - v.errors > 0 ? `${v.correct}/${v.total - v.errors}` : "n/a",
        fieldRecall: v.expectedFields ? `${v.matchedFields}/${v.expectedFields}` : "n/a",
        fieldPrecision: v.proposedFields ? `${v.matchedFields}/${v.proposedFields}` : "n/a",
        confusion: v.confusion,
      },
    ]),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Synthetic cases only. 'dev' cases informed the baseline rules and prompt; 'heldout' cases were written after both were frozen and are not used for tuning. Not evidence of real-world performance.",
    promptVersion: PROMPT_VERSION,
    model: useModel ? { primary: modelId(), fallback: fallbackModelId() } : null,
    summary,
    rows,
  };
  const out = process.argv.includes("--write") ? "reports/ai-eval-latest.json" : "reports/ai-eval-run.local.json";
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(summary, (k, v) => (k === "confusion" ? undefined : v), 2));
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
