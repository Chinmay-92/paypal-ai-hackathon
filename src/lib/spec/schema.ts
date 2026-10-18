import { z } from "zod";

// How each spec field is verified. The model is only trusted for what it can see
// reliably; numbers come from deterministic measurement, the rest goes to a human.
export const VerificationMethod = z.enum([
  "vision", // logo/print present and placed, label text, packaging type, gross defects, colour family
  "color_delta_e", // CIEDE2000 against a Lab target, white-balanced on the reference card
  "count_per_layer", // count units in one carton layer per photo
  "human", // material, weight, durability, fine tolerances
]);
export type VerificationMethod = z.infer<typeof VerificationMethod>;

export const Citation = z.object({
  messageId: z.string().describe("ID of the source message the requirement came from"),
  quote: z.string().describe("Exact text from that message supporting the requirement"),
});

export const SpecField = z.object({
  id: z.string().describe("Short stable slug, e.g. 'logo_placement'"),
  attribute: z.string().describe("What is being specified, e.g. 'Logo placement'"),
  requirement: z.string().describe("The agreed requirement in plain language"),
  method: VerificationMethod,
  colorTargetHex: z
    .string()
    .nullable()
    .describe("For color_delta_e only: target colour as #rrggbb as agreed by the parties, else null"),
  toleranceDeltaE: z.number().nullable().describe("For color_delta_e only: max CIEDE2000, else null"),
  expectedCount: z.number().int().nullable().describe("For count_per_layer only: units per layer, else null"),
  critical: z.boolean().describe("If true, failing this field blocks release regardless of remedies"),
  citations: z.array(Citation).describe("Every requirement must cite at least one source message"),
});
export type SpecField = z.infer<typeof SpecField>;

export const ExtractedSpec = z.object({
  product: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.string().describe("Decimal string, e.g. '3.00'"),
  currency: z.string().length(3),
  fields: z.array(SpecField),
  unresolved: z
    .array(z.object({ topic: z.string(), reason: z.string() }))
    .describe("Points the parties discussed but did not clearly agree on"),
});
export type ExtractedSpec = z.infer<typeof ExtractedSpec>;

export type ChatMessage = { id: string; author: "buyer" | "supplier"; text: string };

/** Rejects specs whose citations don't point at real messages or don't quote them verbatim. */
export function validateCitations(spec: ExtractedSpec, messages: ChatMessage[]): string[] {
  const byId = new Map(messages.map((m) => [m.id, m.text]));
  const problems: string[] = [];
  for (const field of spec.fields) {
    if (field.citations.length === 0) problems.push(`${field.id}: no citation`);
    for (const c of field.citations) {
      const text = byId.get(c.messageId);
      if (text === undefined) problems.push(`${field.id}: unknown message ${c.messageId}`);
      else if (!normalize(text).includes(normalize(c.quote))) {
        problems.push(`${field.id}: quote not found in ${c.messageId}`);
      }
    }
    if (field.method === "color_delta_e" && (!field.colorTargetHex || field.toleranceDeltaE == null)) {
      problems.push(`${field.id}: colour check needs a target and a tolerance`);
    }
    if (field.method === "count_per_layer" && field.expectedCount == null) {
      problems.push(`${field.id}: count check needs an expected count`);
    }
  }
  return problems;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
