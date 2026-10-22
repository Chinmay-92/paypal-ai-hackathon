import type { NextRequest } from "next/server";
import { decide } from "@/application/reviews";
import { DecisionInput } from "@/application/schemas";
import { currentCustomer, handle, parseBody } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/reviews/[revisionId]/decision">) {
  return handle(req, async () => {
    const { revisionId } = await ctx.params;
    const result = await decide(await currentCustomer(), revisionId, await parseBody(req, DecisionInput), {
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return { action: result.action, dueNowMinor: result.terms.dueNowMinor };
  });
}
