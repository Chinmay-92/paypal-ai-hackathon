import Link from "next/link";

export default function Home() {
  return (
    <>
      <header className="topbar">
        <span className="brand">
          Pact<span>.</span>
        </span>
        <span className="sandbox-flag">Sandbox prototype</span>
        <span className="spacer" />
        <Link href="/login">Sign in</Link>
      </header>
      <main id="main" className="narrow">
        <h1>Changes agreed. Work aligned.</h1>
        <p>
          When a customer changes an agreed job, Pact helps the business update the scope, get approval for that exact revision, collect the correct PayPal payment and give the team the
          current instructions.
        </p>
        <div className="panel stack">
          <h2>What this prototype does</h2>
          <ul>
            <li>Reads pasted customer messages and proposes a cited amendment. A person reviews every change; the model never sets prices or approves anything.</li>
            <li>Publishes immutable revisions. Customers approve or decline the exact version they saw.</li>
            <li>Collects deposits and top-ups as separate PayPal sandbox checkouts that the buyer explicitly approves, with durable recovery for lost responses.</li>
            <li>Shows the team only the current authorized job sheet, and holds work when anything is unresolved.</li>
          </ul>
          <p className="muted small">
            Demonstration data is synthetic. All payments use the PayPal sandbox; no real money moves. This is a hackathon prototype, not a production service.
          </p>
          <div className="row">
            <Link className="button primary" href="/login">
              Open the merchant workspace
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
