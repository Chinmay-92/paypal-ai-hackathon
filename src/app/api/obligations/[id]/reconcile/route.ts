import type { NextRequest } from "next/server";
import { reconcileObligation } from "@/application/payments";
import { currentCustomer, currentMerchant, handle } from "@/server/http";

// "Check payment status": re-reads the provider for this payment. Works for the merchant or the customer.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/obligations/[id]/reconcile">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    const actor = await currentMerchant().catch(() => currentCustomer());
    return { status: await reconcileObligation(actor, id) };
  });
}
