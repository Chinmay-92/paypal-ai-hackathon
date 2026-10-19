import { z } from "zod";
import type { FieldVerdict } from "../mandate";
import type { PhotoChallenge } from "../qc/challenge";
import type { SpecField } from "../spec/schema";
import { parseStructured, type Part } from "./model";

export type ShotPhoto = { shotId: string; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

const VisionResult = z.object({
  shots: z.array(
    z.object({
      shotId: z.string(),
      codeReadInFrame: z.string().nullable().describe("The code written on paper exactly as read, or null if none is legible"),
      unitOrCartonNumberRead: z.string().nullable().describe("Unit or carton number visible in frame, or null"),
      problems: z.array(z.string()).describe("Anything that makes this photo unreliable: blur, glare, cropped, screen photo, edited"),
    }),
  ),
  fields: z.array(
    z.object({
      fieldId: z.string(),
      verdict: z.enum(["pass", "fail", "cant_verify"]),
      evidence: z.string().describe("What in which shot supports the verdict, citing shot IDs"),
      shotIds: z.array(z.string()),
    }),
  ),
});
export type VisionResult = z.infer<typeof VisionResult>;

const SYSTEM = `You are a pre-shipment quality inspector checking a supplier's photos against an agreed spec.

For each field, answer pass, fail, or cant_verify. Use cant_verify whenever the photos do not clearly show the attribute; a confident wrong verdict releases money for bad goods, while cant_verify only sends the field to a human. Do not judge exact colour shades or measure dimensions; you are only asked about the attributes listed.

For each shot, transcribe the paper code and any unit or carton number exactly as written, and list problems that make the photo unreliable.`;

export async function inspectPhotos(fields: SpecField[], challenge: PhotoChallenge, photos: ShotPhoto[]) {
  const visionFields = fields.filter((f) => f.method === "vision");
  const content: Part[] = [];
  for (const photo of photos) {
    const shot = challenge.shots.find((s) => s.id === photo.shotId);
    content.push({ text: `Shot ${photo.shotId}: ${shot?.instruction ?? "unrequested shot"}` });
    content.push({ inlineData: { mimeType: photo.mediaType, data: photo.base64 } });
  }
  content.push({
    text:
      "Fields to check:\n" +
      visionFields.map((f) => `- ${f.id}: ${f.attribute} — ${f.requirement}`).join("\n"),
  });
  const result = await parseStructured({ schema: VisionResult, system: SYSTEM, content });
  return {
    result,
    validShotIds: [...validShots(challenge, result)],
    verdicts: applyChallengeRules(visionFields, challenge, result),
  };
}

/** Shots where the one-time code was read back exactly and no reliability problems were found. */
export function validShots(challenge: PhotoChallenge, result: VisionResult): Set<string> {
  return new Set(
    result.shots
      .filter((s) => s.codeReadInFrame?.toUpperCase().replace(/\s/g, "") === challenge.code && s.problems.length === 0)
      .map((s) => s.shotId),
  );
}

/**
 * Deterministic guardrails on top of the model's verdicts: a verdict only counts if
 * it rests on at least one shot where the one-time code was read back correctly and
 * the photo had no reliability problems. Anything else becomes cant_verify.
 */
export function applyChallengeRules(
  fields: SpecField[],
  challenge: PhotoChallenge,
  result: VisionResult,
): (FieldVerdict & { evidence: string })[] {
  const valid = validShots(challenge, result);
  return fields.map((field) => {
    const answer = result.fields.find((f) => f.fieldId === field.id);
    if (!answer) return { fieldId: field.id, critical: field.critical, verdict: "cant_verify", evidence: "No verdict returned" };
    const supported = answer.shotIds.some((id) => valid.has(id));
    if (!supported) {
      return {
        fieldId: field.id,
        critical: field.critical,
        verdict: "cant_verify",
        evidence: `${answer.evidence} [Rejected: no supporting shot carried the correct code without problems]`,
      };
    }
    return { fieldId: field.id, critical: field.critical, verdict: answer.verdict, evidence: answer.evidence };
  });
}
