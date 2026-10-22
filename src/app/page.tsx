import Link from "next/link";
import { connection } from "next/server";
import { Brand } from "@/ui/Brand";
import { demoModeEnabled } from "@/server/demo";

export default async function Home() {
  await connection();
  const demo = demoModeEnabled();
  return (
    <>
      <header className="topbar">
        <Brand />
        <span className="sandbox-flag">PayPal sandbox prototype</span>
        <span className="spacer" />
        <Link href="/login">Sign in</Link>
      </header>
      <main id="main">
        <section className="hero">
          <div>
            <h1>Changes agreed. Work aligned.</h1>
            <p className="lede">
              Customers change custom orders by message. Pact turns each change into a revision they approve, collects exactly the extra deposit through PayPal, and gives your team only the
              current instructions.
            </p>
            <div className="row" style={{ marginTop: "1.5rem" }}>
              {demo && (
                <Link className="button primary big" href="/demo">
                  Try it with sample jobs
                </Link>
              )}
              <Link className={demo ? "button big" : "button primary big"} href="/login">
                Sign in
              </Link>
            </div>
            <p className="small muted" style={{ marginTop: "1rem" }}>
              Synthetic demo data. Payments use the PayPal sandbox; no real money moves.
            </p>
          </div>

          <figure className="paper-card" aria-label="Example: a customer message becomes a revision">
            <div className="message" style={{ marginBottom: "1rem" }}>
              <div className="meta">
                <strong>Sam, customer</strong>
                <span>by message</span>
              </div>
              <p>
                Make <mark>ten of those hoodies instead</mark>. Use the attached logo on everything.
              </p>
            </div>
            <div className="doc-head">
              <strong>Team shirts, revision 2</strong>
              <span className="badge info">Waiting for Sam</span>
            </div>
            <table className="diff">
              <tbody>
                <tr>
                  <th scope="row">T-shirts</th>
                  <td className="old">
                    <del>50</del>
                  </td>
                  <td>
                    <ins>40</ins>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Hoodies</th>
                  <td className="old">
                    <del>0</del>
                  </td>
                  <td>
                    <ins>10</ins>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Artwork</th>
                  <td className="old">
                    <del>Logo v1</del>
                  </td>
                  <td>
                    <ins>logo-v3.png</ins>
                  </td>
                </tr>
              </tbody>
            </table>
            <dl className="kv" style={{ marginTop: "1rem" }}>
              <dt>New total</dt>
              <dd className="tnum">$800.00</dd>
              <dt>Already paid</dt>
              <dd className="tnum">$300.00</dd>
              <span className="rule" />
              <dt className="strong">Extra deposit via PayPal</dt>
              <dd className="strong tnum">$100.00</dd>
            </dl>
          </figure>
        </section>

        <h2>How a change travels</h2>
        <ol className="flow">
          <li>
            <h3>Message in</h3>
            <p>Paste the customer&apos;s message or let them send it from their page, with files.</p>
          </li>
          <li>
            <h3>You review</h3>
            <p>Pact proposes the change with quotes. You fill gaps and set the price. AI never sets prices.</p>
          </li>
          <li>
            <h3>Customer approves</h3>
            <p>They approve that exact revision on their phone, then pay only the difference through PayPal.</p>
          </li>
          <li>
            <h3>Team builds it</h3>
            <p>Work is released when everything is approved and paid. The job sheet is always current.</p>
          </li>
        </ol>
      </main>
    </>
  );
}
