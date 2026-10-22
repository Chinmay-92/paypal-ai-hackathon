import type { NextRequest } from "next/server";
import { createMerchantSession, MERCHANT_SESSION_TTL_MS } from "@/application/auth";
import { NotFoundError } from "@/application/errors";
import { createDemoWorkspace, demoModeEnabled } from "@/server/demo";
import { appOrigin, cookieOptions, handle, MERCHANT_COOKIE, rateLimit } from "@/server/http";

// Creates an isolated synthetic workspace for a judge and signs them in as its merchant.
export async function POST(req: NextRequest) {
  return handle(req, async () => {
    if (!demoModeEnabled()) throw new NotFoundError("Demo");
    rateLimit(req, "demo-workspace", 3);
    const demo = await createDemoWorkspace(appOrigin(req));
    const token = await createMerchantSession(demo.owner);
    const res = Response.json(
      { ownerEmail: demo.ownerEmail, teamEmail: demo.teamEmail, password: demo.password, jobs: demo.jobs },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
    const c = cookieOptions(MERCHANT_SESSION_TTL_MS / 1000);
    res.headers.append("Set-Cookie", `${MERCHANT_COOKIE}=${token}; Path=/; Max-Age=${c.maxAge}; HttpOnly; SameSite=Lax${c.secure ? "; Secure" : ""}`);
    return res;
  });
}
