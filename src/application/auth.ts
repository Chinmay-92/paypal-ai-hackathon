import { one, pool } from "@/persistence/db";
import type { MerchantActor } from "./actors";
import { UnauthenticatedError } from "./errors";
import { hashToken, newToken, verifyPassword } from "./tokens";

export const MERCHANT_SESSION_TTL_MS = 12 * 3600 * 1000;

// A real hash of a random password, so unknown emails cost the same as wrong passwords.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export async function login(email: string, password: string): Promise<{ token: string; actor: MerchantActor }> {
  const user = await one<{ id: string; tenant_id: string; role: "owner" | "fulfillment"; name: string; password_hash: string }>(
    pool(),
    "SELECT id, tenant_id, role, name, password_hash FROM users WHERE lower(email) = lower($1)",
    [email],
  );
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new UnauthenticatedError("Email or password is incorrect");
  const token = newToken();
  await pool().query("INSERT INTO merchant_sessions (token_hash, user_id, tenant_id, expires_at) VALUES ($1, $2, $3, $4)", [
    token.hash,
    user.id,
    user.tenant_id,
    new Date(Date.now() + MERCHANT_SESSION_TTL_MS),
  ]);
  return { token: token.raw, actor: { kind: "merchant", tenantId: user.tenant_id, userId: user.id, role: user.role, name: user.name } };
}

export async function merchantFromSession(rawToken: string | undefined): Promise<MerchantActor> {
  if (!rawToken) throw new UnauthenticatedError();
  const row = await one<{ user_id: string; tenant_id: string; role: "owner" | "fulfillment"; name: string; expires_at: Date }>(
    pool(),
    `SELECT s.user_id, s.tenant_id, u.role, u.name, s.expires_at FROM merchant_sessions s
     JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id WHERE s.token_hash = $1`,
    [hashToken(rawToken)],
  );
  if (!row || row.expires_at.getTime() < Date.now()) throw new UnauthenticatedError("Your session expired. Sign in again.");
  return { kind: "merchant", tenantId: row.tenant_id, userId: row.user_id, role: row.role, name: row.name };
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (rawToken) await pool().query("DELETE FROM merchant_sessions WHERE token_hash = $1", [hashToken(rawToken)]);
}
