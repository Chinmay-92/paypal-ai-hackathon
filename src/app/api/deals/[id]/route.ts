import { DealNotFoundError, loadDeal } from "@/lib/deal/store";
import { handle } from "@/lib/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/deals/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const deal = await loadDeal(id);
    if (!deal) throw new DealNotFoundError(id);
    return deal;
  });
}
