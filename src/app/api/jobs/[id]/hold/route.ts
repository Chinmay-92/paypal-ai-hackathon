import type { NextRequest } from "next/server";
import { z } from "zod";
import { setHold } from "@/application/fulfillment";
import { currentMerchant, handle, parseBody } from "@/server/http";

const Input = z.object({ expectedVersion: z.number().int(), reason: z.string().trim().min(3).max(500).nullable() });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/hold">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    const input = await parseBody(req, Input);
    await setHold(await currentMerchant(), id, input.expectedVersion, input.reason);
  });
}
