import Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import { ClaudeSetupError, ModelOutputError, ModelRefusalError } from "./ai/claude";
import { DealStateError } from "./deal/service";
import { DealNotFoundError } from "./deal/store";
import { ConfigError, PayPalError } from "./paypal/client";

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    if (err instanceof DealNotFoundError) return error(404, err.message);
    if (err instanceof DealStateError) return error(409, err.message);
    if (err instanceof ZodError) return error(400, "Invalid request", err.issues);
    if (err instanceof PayPalError) {
      return error(502, err.message, { paypalError: err.errorName, debugId: err.debugId, details: err.details });
    }
    if (err instanceof ConfigError || err instanceof ClaudeSetupError) return error(503, err.message);
    if (err instanceof Anthropic.AuthenticationError) return error(503, "Claude API credentials are missing or invalid (set ANTHROPIC_API_KEY)");
    if (err instanceof Anthropic.APIError) return error(502, `Claude API error ${err.status ?? ""}: ${err.message}`);
    if (err instanceof ModelRefusalError || err instanceof ModelOutputError) return error(422, err.message);
    console.error(err);
    return error(500, "Unexpected error");
  }
}

function error(status: number, message: string, details?: unknown): Response {
  return Response.json({ error: message, details }, { status });
}
