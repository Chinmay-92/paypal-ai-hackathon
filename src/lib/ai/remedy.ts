import { z } from "zod";
import { checkOffer, type BuyerMandate, type OfferCheck, type RemedyOffer, type SupplierMandate } from "../mandate";
import type { Money } from "../money";
import { parseStructured } from "./claude";

const OfferSchema = z.object({
  kind: z.enum(["discount", "remake"]),
  discountBps: z.number().int().nullable().describe("For discount: share of the balance in basis points, else null"),
  days: z.number().int().nullable().describe("For remake: days needed to remake the failed units, else null"),
  note: z.string().describe("Short message to the buyer explaining the offer"),
});

const SYSTEM = `You negotiate on behalf of a supplier after their goods failed a pre-shipment quality check. Propose one remedy the buyer is likely to accept: a discount on the unpaid balance, or remaking the failed units. Stay within the supplier's limits unless no offer inside them could fairly resolve the failure. Be specific in the note about which failures the remedy covers.`;

export type ProposedRemedy = { offer: RemedyOffer; check: OfferCheck };

export async function proposeRemedy(args: {
  failures: { fieldId: string; evidence: string }[];
  criticalFailure: boolean;
  balance: Money;
  supplier: SupplierMandate;
  buyer: BuyerMandate;
  rejectedReason?: string;
}): Promise<ProposedRemedy> {
  const text = [
    `Failed fields:\n${args.failures.map((f) => `- ${f.fieldId}: ${f.evidence}`).join("\n")}`,
    `A critical field failed: ${args.criticalFailure ? "yes (only a remake or a full waiver of the balance can resolve it)" : "no"}`,
    `Supplier limits: discount up to ${args.supplier.maxDiscountBps / 100}% of the balance; remake ${args.supplier.allowRemake ? `allowed within ${args.supplier.maxRemakeDays} days` : "not allowed"}.`,
    args.rejectedReason ? `Your previous offer was rejected: ${args.rejectedReason}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await parseStructured({ schema: OfferSchema, system: SYSTEM, content: [{ type: "text", text }], effort: "medium" });
  const offer: RemedyOffer =
    raw.kind === "discount"
      ? { kind: "discount", discountBps: raw.discountBps ?? 0, note: raw.note }
      : { kind: "remake", days: raw.days ?? 0, note: raw.note };
  return { offer, check: checkOffer(offer, args.balance, args.supplier, args.buyer, args.criticalFailure) };
}
