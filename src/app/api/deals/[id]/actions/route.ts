import { z } from "zod";
import { approveSpec, defaultDeps, issueChallenge, proposeSpec, resolve, startPayment } from "@/lib/deal/service";
import { handle } from "@/lib/http";

const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("propose_spec") }),
  z.object({ type: z.literal("approve_spec"), party: z.enum(["buyer", "supplier"]), specHash: z.string() }),
  z.object({ type: z.literal("start_payment") }),
  z.object({ type: z.literal("issue_challenge") }),
  z.object({
    type: z.literal("resolve"),
    action: z.enum(["buyer_release", "buyer_accept_remedy", "supplier_approve_remedy", "request_new_offer"]),
  }),
]);

// The demo runs both parties in one browser, so there is no per-party auth yet.
export async function POST(req: Request, ctx: RouteContext<"/api/deals/[id]/actions">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const action = Action.parse(await req.json());
    const deps = await defaultDeps();
    switch (action.type) {
      case "propose_spec":
        return proposeSpec(id, deps);
      case "approve_spec":
        return approveSpec(id, action.party, action.specHash);
      case "start_payment":
        return startPayment(id, new URL(req.url).origin, deps);
      case "issue_challenge":
        return issueChallenge(id, deps);
      case "resolve":
        return resolve(id, action.action, deps);
    }
  });
}
