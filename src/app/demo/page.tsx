import { connection } from "next/server";
import { notFound } from "next/navigation";
import { demoModeEnabled } from "@/server/demo";
import { DemoLauncher } from "./DemoLauncher";

export default async function DemoPage() {
  await connection();
  if (!demoModeEnabled()) notFound();
  return (
    <>
      <header className="topbar">
        <span className="brand">
          Pact<span>.</span>
        </span>
        <span className="sandbox-flag">PayPal sandbox · synthetic data</span>
      </header>
      <main id="main" className="narrow stack">
        <h1>Try Pact</h1>
        <p>
          This creates a private demo workspace just for you, with two synthetic jobs (custom apparel and a website project). You will be signed in as the business owner, and you get customer
          review links to open in a second browser window or on your phone.
        </p>
        <div className="notice info">
          <p>
            Payments use the <strong>PayPal sandbox</strong>, so no real money moves. To pay as the customer, log in on PayPal&apos;s sandbox page with a sandbox <em>Personal</em> account. Judges:
            test buyer credentials are in the submission&apos;s testing instructions. Never enter a real card or real PayPal login.
          </p>
        </div>
        <DemoLauncher />
      </main>
    </>
  );
}
