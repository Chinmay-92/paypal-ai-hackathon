// Minimal PayPal REST client. Every money-moving call takes an explicit
// PayPal-Request-Id derived from our own action ID, so retries are idempotent.
// (The Agent Toolkit sets one request ID per client, which is unsafe for refunds.)

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  fetch?: typeof fetch;
};

export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly errorName: string,
    message: string,
    readonly debugId: string | undefined,
    readonly details: unknown,
  ) {
    super(`PayPal ${status} ${errorName}: ${message}${debugId ? ` (debug_id ${debugId})` : ""}`);
  }
}

export class ConfigError extends Error {}

export const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): PayPalConfig {
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ConfigError("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
  return { clientId, clientSecret, baseUrl: env.PAYPAL_BASE_URL ?? SANDBOX_BASE_URL };
}

export class PayPalClient {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly fetch: typeof fetch;

  constructor(private readonly config: PayPalConfig) {
    this.fetch = config.fetch ?? fetch;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const res = await this.fetch(`${this.config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      throw new PayPalError(res.status, body.error ?? "AUTH_FAILED", body.error_description ?? "token request failed", undefined, body);
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 0) * 1000 };
    return this.token.value;
  }

  async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    options: { body?: unknown; requestId?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;
    const res = await this.fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new PayPalError(res.status, json.name ?? "UNKNOWN", json.message ?? res.statusText, json.debug_id, json.details);
    }
    return json as T;
  }
}
