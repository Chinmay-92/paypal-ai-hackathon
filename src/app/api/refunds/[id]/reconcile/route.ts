import type { NextRequest } from "next/server";
import { requireOwner } from "@/application/actors";
import { reconcileRefund } from "@/application/payments";
import { currentMerchant, handle } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/refunds/[id]/reconcile">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    const actor = requireOwner(await currentMerchant());
    const refund = await reconcileRefund(actor.tenantId, id);
    return { status: refund.status };
  });
}
