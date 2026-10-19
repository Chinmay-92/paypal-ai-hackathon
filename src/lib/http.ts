import { ZodError } from "zod";
import { ModelApiError, ModelOutputError, ModelRefusalError, ModelSetupError } from "./ai/model";
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
    if (err instanceof ConfigError || err instanceof ModelSetupError) return error(503, err.message);
    if (err instanceof ModelApiError && (err.status === 401 || err.status === 403)) {
      return error(503, "Gemini API key is invalid (check GEMINI_API_KEY)");
    }
    if (err instanceof ModelApiError) return error(502, `Gemini API error ${err.status}: ${err.message}`);
    if (err instanceof ModelRefusalError || err instanceof ModelOutputError) return error(422, err.message);
    console.error(err);
    return error(500, "Unexpected error");
  }
}

function error(status: number, message: string, details?: unknown): Response {
  return Response.json({ error: message, details }, { status });
}
