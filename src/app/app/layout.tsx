import Link from "next/link";
import { redirect } from "next/navigation";
import { one, pool } from "@/persistence/db";
import { currentMerchant } from "@/server/http";
import { Brand } from "@/ui/Brand";
import { SignOut } from "./SignOut";

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentMerchant().catch(() => null);
  if (!actor) redirect("/login");
  const tenant = await one<{ name: string }>(pool(), "SELECT name FROM tenants WHERE id = $1", [actor.tenantId]);
  return (
    <>
      <header className="topbar">
        <Brand href="/app/jobs" />
        <span className="sandbox-flag">PayPal sandbox</span>
        <nav aria-label="Workspace">
          <Link href="/app/jobs">Jobs</Link>
          {actor.role === "owner" && <Link href="/app/jobs/new">New job</Link>}
        </nav>
        <span className="spacer" />
        <span className="muted small who-am-i">
          {actor.name}, {tenant?.name}
        </span>
        <SignOut />
      </header>
      <main id="main">{children}</main>
    </>
  );
}
