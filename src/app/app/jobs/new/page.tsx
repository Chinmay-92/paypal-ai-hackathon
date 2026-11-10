import { redirect } from "next/navigation";
import { loadCatalog } from "@/persistence/repo";
import { pool } from "@/persistence/db";
import { currentMerchant } from "@/server/http";
import { NewJobForm } from "./NewJobForm";

export default async function NewJobPage() {
  const actor = await currentMerchant();
  if (actor.role !== "owner") redirect("/app/jobs");
  const [apparel, website] = await Promise.all([loadCatalog(pool(), actor.tenantId, "apparel"), loadCatalog(pool(), actor.tenantId, "website")]);
  return (
    <div style={{ maxWidth: 900 }}>
      <h1>New job</h1>
      <p className="muted">Enter the original agreement and save it as a draft. Once you publish it, you can share a review link with your customer.</p>
      <NewJobForm catalogs={{ apparel, website }} />
    </div>
  );
}
