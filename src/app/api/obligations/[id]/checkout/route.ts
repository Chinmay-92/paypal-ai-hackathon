import type { NextRequest } from "next/server";
import { startCheckout } from "@/application/payments";
import { appOrigin, currentCustomer, handle } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/obligations/[id]/checkout">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    return startCheckout(await currentCustomer(), id, appOrigin(req));
  });
}
