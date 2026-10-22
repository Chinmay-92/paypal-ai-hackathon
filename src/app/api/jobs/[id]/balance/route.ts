import type { NextRequest } from "next/server";
import { requestBalance } from "@/application/payments";
import { VersionInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/balance">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    const { expectedVersion } = await parseBody(req, VersionInput);
    const o = await requestBalance(await currentMerchant(), id, expectedVersion);
    return { obligationId: o.id, amountMinor: o.amount_minor };
  });
}
