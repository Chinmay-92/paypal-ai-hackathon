import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { merchantFromSession } from "@/application/auth";
import { AppError, ForbiddenError } from "@/application/errors";
import { customerFromSession } from "@/application/reviews";
import { PaymentsNotConfiguredError } from "@/integrations/paypal/provider";
import { DatabaseConfigError } from "@/persistence/db";

export const MERCHANT_COOKIE = "pact_session";
export const CUSTOMER_COOKIE = "pact_review";

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Public origin for links and redirects. Behind a proxy (Render) the request URL is internal, so production requires APP_ORIGIN. */
export function appOrigin(req: NextRequest): string {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN;
  if (process.env.NODE_ENV === "production") throw new AppError(503, "UNAVAILABLE", "APP_ORIGIN is not configured");
  return req.nextUrl.origin;
}

/** CSRF defence for cookie-authenticated writes: the browser's Origin must be ours. */
export function requireSameOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  const allowed = new Set([req.nextUrl.origin, process.env.APP_ORIGIN].filter(Boolean));
  if (!origin || !allowed.has(origin)) throw new ForbiddenError("Cross-origin request refused");
}

const buckets = new Map<string, { tokens: number; at: number }>();

/** Small per-process limiter for login and link exchange. A multi-instance deployment needs a shared store. */
export function rateLimit(req: NextRequest, key: string, perMinute: number): void {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const id = `${key}:${ip}`;
  const now = Date.now();
  const b = buckets.get(id) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) throw new AppError(429, "RATE_LIMITED", "Too many attempts. Wait a minute and try again.");
  b.tokens -= 1;
  buckets.set(id, b);
}

export async function currentMerchant() {
  return merchantFromSession((await cookies()).get(MERCHANT_COOKIE)?.value);
}

export async function currentCustomer() {
  return customerFromSession((await cookies()).get(CUSTOMER_COOKIE)?.value);
}

export async function parseBody<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  const json = await req.json().catch(() => {
    throw new AppError(400, "BAD_REQUEST", "Request body must be JSON");
  });
  return schema.parse(json);
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) return Response.json({ error: err.message, code: err.code, details: err.details }, { status: err.status });
  if (err instanceof ZodError) {
    return Response.json({ error: "Invalid request", code: "BAD_REQUEST", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  if (err instanceof PaymentsNotConfiguredError || err instanceof DatabaseConfigError) {
    return Response.json({ error: err.message, code: "UNAVAILABLE" }, { status: 503 });
  }
  // Log the category only: no request bodies, customer text or provider payloads.
  console.error(JSON.stringify({ level: "error", category: "unhandled", name: err instanceof Error ? err.name : "unknown", message: err instanceof Error ? err.message.slice(0, 200) : "" }));
  return Response.json({ error: "Something went wrong. Nothing was changed by this request if it did not complete.", code: "INTERNAL" }, { status: 500 });
}

/** Wraps a route handler: same-origin check for writes, JSON errors. */
export async function handle(req: NextRequest, fn: () => Promise<unknown>, opts: { csrf?: boolean; status?: number } = {}): Promise<Response> {
  try {
    if (opts.csrf ?? req.method !== "GET") requireSameOrigin(req);
    const result = await fn();
    if (result instanceof Response) return result;
    return Response.json(result ?? { ok: true }, { status: opts.status ?? 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
