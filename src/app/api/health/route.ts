import { paymentsConfigured } from "@/integrations/paypal/http";
import { modelConfigured, modelId } from "@/integrations/ai/model";
import { pool } from "@/persistence/db";

export async function GET() {
  let database = "ok";
  try {
    await pool().query("SELECT 1");
  } catch {
    database = "unavailable";
  }
  return Response.json(
    { database, payments: paymentsConfigured() ? "paypal-sandbox" : "not configured", ai: modelConfigured() ? modelId() : "baseline only" },
    { status: database === "ok" ? 200 : 503 },
  );
}
