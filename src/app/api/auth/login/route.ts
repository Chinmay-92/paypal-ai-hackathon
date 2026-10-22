import type { NextRequest } from "next/server";
import { login, MERCHANT_SESSION_TTL_MS } from "@/application/auth";
import { LoginInput } from "@/application/schemas";
import { cookieOptions, handle, MERCHANT_COOKIE, parseBody, rateLimit } from "@/server/http";

export async function POST(req: NextRequest) {
  return handle(req, async () => {
    rateLimit(req, "login", 10);
    const input = await parseBody(req, LoginInput);
    const { token, actor } = await login(input.email, input.password);
    const res = Response.json({ ok: true, role: actor.role });
    const c = cookieOptions(MERCHANT_SESSION_TTL_MS / 1000);
    res.headers.append("Set-Cookie", `${MERCHANT_COOKIE}=${token}; Path=${c.path}; Max-Age=${c.maxAge}; HttpOnly; SameSite=Lax${c.secure ? "; Secure" : ""}`);
    return res;
  });
}
