import { createDeal } from "@/lib/deal/service";
import { DEMO_BUYER_MANDATE, DEMO_MESSAGES, DEMO_SUPPLIER_MANDATE } from "@/lib/demo";
import { handle } from "@/lib/http";

// Starts a deal from the demo negotiation. Custom transcripts can be added later.
export async function POST() {
  return handle(() =>
    createDeal({
      messages: DEMO_MESSAGES,
      buyerMandate: DEMO_BUYER_MANDATE,
      supplierMandate: DEMO_SUPPLIER_MANDATE,
    }),
  );
}
