import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
export function claude(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export class ModelRefusalError extends Error {}
export class ModelOutputError extends Error {}
/** The SDK failed before reaching the API, e.g. no credentials configured. */
export class ClaudeSetupError extends Error {}

/**
 * One structured-output call. Server-side fallbacks ("default") re-run a request
 * that a safety classifier declines on Anthropic's recommended fallback model.
 */
export async function parseStructured<S extends z.ZodType>(args: {
  schema: S;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  let response;
  try {
    response = await claude().beta.messages.parse({
      model: MODEL,
      max_tokens: args.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: args.effort ?? "medium", format: betaZodOutputFormat(args.schema) },
      system: args.system,
      messages: [{ role: "user", content: args.content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) throw err;
    throw new ClaudeSetupError(`Claude request failed before reaching the API: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (response.stop_reason === "refusal") {
    throw new ModelRefusalError(`Model declined: ${response.stop_details?.category ?? "unknown"}`);
  }
  if (response.stop_reason === "max_tokens") throw new ModelOutputError("Model output was truncated");
  if (response.parsed_output == null) throw new ModelOutputError("Model output did not match the schema");
  return response.parsed_output as z.infer<S>;
}
