import { ApiError, FinishReason, GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";

export type { Part };

/** Override with GEMINI_MODEL. Flash, because the free tier allows no Pro requests. */
export const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

export class ModelRefusalError extends Error {}
export class ModelOutputError extends Error {}
/** The call failed before reaching the API, e.g. no credentials configured. */
export class ModelSetupError extends Error {}
export { ApiError as ModelApiError };

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ModelSetupError("Gemini API key is missing (set GEMINI_API_KEY)");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/** One structured-output call: the model must return JSON matching `schema`, validated again with zod. */
export async function parseStructured<S extends z.ZodType>(args: {
  schema: S;
  system: string;
  content: Part[];
  maxTokens?: number;
}): Promise<z.infer<S>> {
  let response;
  try {
    response = await gemini().models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: args.content }],
      config: {
        systemInstruction: args.system,
        maxOutputTokens: args.maxTokens ?? 16000,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(args.schema),
      },
    });
  } catch (err) {
    if (err instanceof ApiError || err instanceof ModelSetupError) throw err;
    throw new ModelSetupError(`Gemini request failed before reaching the API: ${err instanceof Error ? err.message : String(err)}`);
  }
  const blocked = response.promptFeedback?.blockReason;
  if (blocked) throw new ModelRefusalError(`Model declined the prompt: ${blocked}`);
  const finish = response.candidates?.[0]?.finishReason;
  if (finish === FinishReason.MAX_TOKENS) throw new ModelOutputError("Model output was truncated");
  if (finish && finish !== FinishReason.STOP) throw new ModelRefusalError(`Model stopped early: ${finish}`);

  let json: unknown;
  try {
    json = JSON.parse(response.text ?? "");
  } catch {
    throw new ModelOutputError("Model output was not valid JSON");
  }
  const parsed = args.schema.safeParse(json);
  if (!parsed.success) throw new ModelOutputError("Model output did not match the schema");
  return parsed.data;
}
