import type { NextRequest } from "next/server";
import { extractOriginalAgreement } from "@/application/originals";
import { ExtractOriginalInput } from "@/application/schemas";
import { currentMerchant, handle, parseBody, rateLimit } from "@/server/http";

// Proposal only; nothing is stored until the merchant saves a draft.
export async function POST(req: NextRequest) {
  return handle(req, async () => {
    rateLimit(req, "extract-original", 10);
    return extractOriginalAgreement(await currentMerchant(), await parseBody(req, ExtractOriginalInput));
  });
}
