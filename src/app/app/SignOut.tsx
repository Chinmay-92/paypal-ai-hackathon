"use client";

import { useRouter } from "next/navigation";
import { postJson } from "@/ui/api";

export function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="link"
      onClick={async () => {
        await postJson("/api/auth/logout").catch(() => undefined);
        router.push("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
