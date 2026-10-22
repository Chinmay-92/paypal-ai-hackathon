import type { NextRequest } from "next/server";
import { captureCheckout } from "@/application/payments";
import { currentCustomer, handle } from "@/server/http";

// Called by the return page. The browser return itself proves nothing: the
// order is checked with PayPal and captured server-side.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/payment-operations/[id]/capture">) {
  return handle(req, async () => {
    const { id } = await ctx.params;
    return captureCheckout(await currentCustomer(), id);
  });
}
