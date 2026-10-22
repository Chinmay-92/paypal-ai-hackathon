import type { NextRequest } from "next/server";
import { CUSTOMER_SESSION_TTL_MS, exchangeInvitation } from "@/application/reviews";
import { appOrigin, cookieOptions, CUSTOMER_COOKIE, errorResponse, rateLimit } from "@/server/http";

// Exchanges a review link for a job-scoped customer session, then redirects
// so the token does not stay in the address bar or history.
export async function GET(req: NextRequest, ctx: RouteContext<"/review/[token]">) {
  try {
    rateLimit(req, "review-link", 30);
    const { token } = await ctx.params;
    const result = await exchangeInvitation(token);
    if (!result.ok) return Response.redirect(new URL(`/portal/link?reason=${result.reason}`, appOrigin(req)), 303);
    const res = new Response(null, { status: 303, headers: { Location: new URL(`/portal/${result.jobId}`, appOrigin(req)).toString() } });
    const c = cookieOptions(CUSTOMER_SESSION_TTL_MS / 1000);
    res.headers.append("Set-Cookie", `${CUSTOMER_COOKIE}=${result.sessionToken}; Path=/; Max-Age=${c.maxAge}; HttpOnly; SameSite=Lax${c.secure ? "; Secure" : ""}`);
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
