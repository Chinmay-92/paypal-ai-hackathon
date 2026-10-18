import { completeBuyerApproval, defaultDeps } from "@/lib/deal/service";
import { PayPalError } from "@/lib/paypal/client";

// PayPal redirects the buyer here after approval with ?token=<order id>.
export async function GET(req: Request, ctx: RouteContext<"/api/deals/[id]/paypal/return">) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const orderId = url.searchParams.get("token");
  const back = new URL(`/deals/${id}`, url.origin);
  if (!orderId) {
    back.searchParams.set("payment", "missing-token");
    return Response.redirect(back, 303);
  }
  try {
    await completeBuyerApproval(id, orderId, await defaultDeps());
    back.searchParams.set("payment", "ok");
  } catch (err) {
    console.error(err);
    back.searchParams.set("payment", "failed");
    if (err instanceof PayPalError) back.searchParams.set("reason", err.errorName);
  }
  return Response.redirect(back, 303);
}
