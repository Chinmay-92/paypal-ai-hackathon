import { connection } from "next/server";
import { notFound } from "next/navigation";
import { demoModeEnabled } from "@/server/demo";
import { Brand } from "@/ui/Brand";
import { DemoLauncher } from "./DemoLauncher";

export default async function DemoPage() {
  await connection();
  if (!demoModeEnabled()) notFound();
  return (
    <>
      <header className="topbar">
        <Brand />
        <span className="sandbox-flag">PayPal sandbox · Sample data</span>
      </header>
      <main id="main" className="narrow stack demo-page">
        <h1>Try Pact with sample orders</h1>
        <p className="demo-lede">
          Create a private workspace with two sample jobs: a custom apparel order and a website project. You’ll get links to try the customer view, too.
        </p>
        <div className="notice info">
          <p>
            Payments use the <strong>PayPal sandbox</strong>. No real money moves. To try a payment, sign in to PayPal with a sandbox <em>Personal</em> account. Judges can find the test buyer details in the submission’s testing instructions. Please don’t use a real card or PayPal account.
          </p>
        </div>
        <DemoLauncher />
      </main>
    </>
  );
}
