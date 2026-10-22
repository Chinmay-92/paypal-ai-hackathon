import type { NextRequest } from "next/server";
import { handleWebhook } from "@/application/payments";
import { errorResponse } from "@/server/http";

// No session or CSRF check: authenticity comes only from PayPal's signature verification.
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 256_000) return Response.json({ error: "too large" }, { status: 413 });
    const h = req.headers;
    const result = await handleWebhook(
      {
        authAlgo: h.get("paypal-auth-algo"),
        certUrl: h.get("paypal-cert-url"),
        transmissionId: h.get("paypal-transmission-id"),
        transmissionSig: h.get("paypal-transmission-sig"),
        transmissionTime: h.get("paypal-transmission-time"),
      },
      raw,
    );
    return Response.json({ result: result.result }, { status: result.status });
  } catch (err) {
    return errorResponse(err);
  }
}
