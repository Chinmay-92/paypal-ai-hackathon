import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { logout } from "@/application/auth";
import { handle, MERCHANT_COOKIE } from "@/server/http";

export async function POST(req: NextRequest) {
  return handle(req, async () => {
    const jar = await cookies();
    await logout(jar.get(MERCHANT_COOKIE)?.value);
    jar.delete(MERCHANT_COOKIE);
  });
}
