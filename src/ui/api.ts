"use client";

export type ApiError = { error: string; code?: string; details?: unknown };

/** JSON POST to our own API. Throws an Error whose message is safe to show. */
export async function postJson<T = unknown>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) {
    const err = new Error(json.error ?? `Request failed (${res.status})`) as Error & { status: number; details?: unknown };
    err.status = res.status;
    err.details = json.details;
    throw err;
  }
  return json;
}

export function detailList(details: unknown): string[] {
  if (!details || typeof details !== "object") return [];
  const d = details as { problems?: string[]; blockers?: { message: string }[] };
  if (Array.isArray(d.problems)) return d.problems;
  if (Array.isArray(d.blockers)) return d.blockers.map((b) => b.message);
  if (Array.isArray(details)) return (details as { path?: string; message: string }[]).map((x) => (x.path ? `${x.path}: ${x.message}` : x.message));
  return [];
}
