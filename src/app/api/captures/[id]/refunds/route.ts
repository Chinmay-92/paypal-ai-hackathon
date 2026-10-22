import type { NextRequest } from "next/server";
import { requestRefund } from "@/application/payments";
import { RefundInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/captures/[id]/refunds">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    const refund = await requestRefund(await currentMerchant(), id, await parseBody(req, RefundInput));
    return { refundId: refund.id, status: refund.status };
  });
}
