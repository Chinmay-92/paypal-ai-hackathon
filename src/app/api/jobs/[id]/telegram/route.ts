import type { NextRequest } from "next/server";
import { createTelegramLink } from "@/application/telegram";
import { botUsername } from "@/integrations/telegram/config";
import { currentMerchant, handle } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/jobs/[id]/telegram">) {
  return handle(req, async () => {
    const actor = await currentMerchant();
    const { id } = await ctx.params;
    const username = await botUsername();
    return { url: await createTelegramLink(actor, id, username) };
  });
}
