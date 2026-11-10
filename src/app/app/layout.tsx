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
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="sidebar-brand"><Brand href="/app/jobs" /><span className="sidebar-edition">Workspace</span></div>
        <div className="sidebar-section-label">Your work</div>
        <nav className="sidebar-nav" aria-label="Workspace">
          <Link href="/app/jobs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M9 5v15" /></svg>
            Jobs
          </Link>
          {actor.role === "owner" && <Link href="/app/jobs/new">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 8v8m-4-4h8" /></svg>
            New job
          </Link>}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-account"><span className="sidebar-account-mark" aria-hidden="true">{actor.name.trim().charAt(0).toUpperCase()}</span><span><strong>{tenant?.name}</strong><small>{actor.name}</small></span></div>
          <SignOut />
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header"><span>Workspace</span><span className="sandbox-flag">PayPal sandbox</span></header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
