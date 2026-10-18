import type { BuyerMandate, SupplierMandate } from "./mandate";
import type { ChatMessage } from "./spec/schema";

// A small brand ordering custom tote bags from an overseas supplier. Includes one
// proposal that was never agreed (embroidery), which must land in "unresolved".
export const DEMO_MESSAGES: ChatMessage[] = [
  { id: "m1", author: "buyer", text: "Hi! We'd like 1,000 natural cotton tote bags, 38 x 42 cm, 280 GSM canvas, with our logo screen-printed on the front." },
  { id: "m2", author: "supplier", text: "Sure. 280 GSM natural canvas, 38 x 42 cm, single-colour screen print front. $3.00 per bag at 1,000 pcs, 50 bags per carton." },
  { id: "m3", author: "buyer", text: "The logo must be our navy, hex #1f3a68, centred on the front, 20 cm wide, 8 cm below the top seam. Artwork file attached." },
  { id: "m4", author: "supplier", text: "Confirmed: navy #1f3a68, centred, 20 cm wide, 8 cm below top seam." },
  { id: "m5", author: "supplier", text: "Would you like embroidery on the handle too? +$0.40 per bag." },
  { id: "m6", author: "buyer", text: "Let me think about the embroidery. Also each bag needs a care label sewn inside reading '100% cotton – wash cold'." },
  { id: "m7", author: "supplier", text: "OK, care label inside with that exact text. Each bag folded and packed in a clear polybag." },
  { id: "m8", author: "buyer", text: "Great. Agreed at $3.00 USD per bag, 1,000 pcs, 30% deposit and 70% balance after pre-shipment photo check." },
  { id: "m9", author: "supplier", text: "Agreed." },
];

export const DEMO_BUYER_MANDATE: BuyerMandate = {
  maxAutoReleaseMinor: 250_000, // up to $2,500 released without a tap
  autoAcceptDiscountBps: 1500, // auto-accept remedies of 15%+ off the balance
  acceptRemake: true,
};

export const DEMO_SUPPLIER_MANDATE: SupplierMandate = {
  maxDiscountBps: 1000, // agent may offer up to 10% on its own
  allowRemake: true,
  maxRemakeDays: 14,
};
