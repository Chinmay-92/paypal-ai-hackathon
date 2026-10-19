import { ExtractedSpec, validateCitations, type ChatMessage } from "../spec/schema";
import { parseStructured } from "./model";

const SYSTEM = `You turn a buyer–supplier negotiation into a structured product spec that both parties will sign.

Only record requirements both sides agreed to. A proposal the other party never accepted belongs in "unresolved", not in "fields". Quote the source text verbatim in each citation, using the message IDs given.

Choose each field's verification method by what a phone photo can prove:
- vision: logo or print presence and placement, label or barcode text, packaging type, gross visible defects, colour family.
- color_delta_e: an exact agreed colour. Set colorTargetHex from the hex value or swatch the parties gave, and toleranceDeltaE (3 unless they agreed otherwise). If they named a colour without a hex value, use vision for colour family and add the exact colour to "unresolved".
- count_per_layer: units per carton layer.
- human: material composition, weight or GSM, durability, function, odour, and any dimensional tolerance under 2 mm.

Mark a field critical when getting it wrong makes the goods unusable for the buyer (for example a wrong logo).`;

export async function extractSpec(messages: ChatMessage[]) {
  const transcript = messages.map((m) => `[${m.id}] ${m.author}: ${m.text}`).join("\n");
  const spec = await parseStructured({
    schema: ExtractedSpec,
    system: SYSTEM,
    content: [{ text: `<negotiation>\n${transcript}\n</negotiation>` }],
  });
  return { spec, problems: validateCitations(spec, messages) };
}
