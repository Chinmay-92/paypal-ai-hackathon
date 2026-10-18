import { randomInt } from "node:crypto";
import type { SpecField } from "../spec/schema";

// The photo challenge makes reusing photos of a single "golden sample" expensive:
// the supplier must photograph units and cartons chosen at challenge time, with a
// one-time code written on paper in every frame. It raises the cost of fraud; it
// does not eliminate it.

export type ShotRequest = {
  id: string;
  instruction: string;
  fieldIds: string[];
  unitNumber: number | null;
  cartonNumber: number | null;
};

export type PhotoChallenge = {
  code: string;
  issuedAt: string;
  expiresAt: string;
  shots: ShotRequest[];
};

const CODE_ALPHABET = "ACDEFHJKMNPRTUVWXY34679"; // no look-alike characters

export function oneTimeCode(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

function pickDistinct(count: number, max: number): number[] {
  const picked = new Set<number>();
  const target = Math.min(count, max);
  while (picked.size < target) picked.add(randomInt(1, max + 1));
  return [...picked];
}

export function buildChallenge(
  fields: SpecField[],
  quantity: number,
  unitsPerCarton: number,
  now: Date,
  ttlMinutes = 120,
): PhotoChallenge {
  const code = oneTimeCode();
  const cartons = Math.max(1, Math.ceil(quantity / unitsPerCarton));
  const units = pickDistinct(3, quantity);
  const [carton] = pickDistinct(1, cartons);
  const visionFields = fields.filter((f) => f.method === "vision" || f.method === "color_delta_e");
  const countFields = fields.filter((f) => f.method === "count_per_layer");

  const shots: ShotRequest[] = units.map((unit, i) => ({
    id: `unit-${i + 1}`,
    instruction:
      `Pull unit #${unit} from the batch. Photograph it flat in daylight with the reference colour card ` +
      `and a paper showing the code ${code} fully in frame.`,
    fieldIds: visionFields.map((f) => f.id),
    unitNumber: unit,
    cartonNumber: null,
  }));
  if (countFields.length > 0) {
    shots.push({
      id: "carton-layer",
      instruction: `Open carton #${carton}. Photograph the top layer from directly above with the code ${code} in frame.`,
      fieldIds: countFields.map((f) => f.id),
      unitNumber: null,
      cartonNumber: carton,
    });
  }
  shots.push({
    id: "batch-wide",
    instruction: `Wide shot of all stacked cartons with carton #${carton} label visible and the code ${code} in frame.`,
    fieldIds: [],
    unitNumber: null,
    cartonNumber: carton,
  });

  return {
    code,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
    shots,
  };
}
