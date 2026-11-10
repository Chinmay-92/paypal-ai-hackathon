import Link from "next/link";
import { connection } from "next/server";
import { Brand } from "@/ui/Brand";
import { demoModeEnabled } from "@/server/demo";

export default async function Home() {
  await connection();
  const demo = demoModeEnabled();

  return (
    <div className="landing">
      <header className="topbar landing-nav">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
        </nav>
        <span className="spacer" />
        <Link className="landing-signin" href="/login">Sign in</Link>
        {demo && <Link className="button landing-nav-cta" href="/demo">Try the demo <span aria-hidden="true">↗</span></Link>}
      </header>

      <main id="main" className="landing-main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span aria-hidden="true" className="eyebrow-mark" /> For custom orders and projects</p>
            <h1 id="hero-title">Manage changes <span>to orders and projects.</span></h1>
            <p className="lede">Review customer requests, update agreements and collect payments through PayPal.</p>
            <div className="hero-actions">
              {demo && <Link className="button primary big" href="/demo">Try the demo <span aria-hidden="true">↗</span></Link>}
              <a className="hero-text-link" href="#how-it-works">How it works <span aria-hidden="true">↓</span></a>
            </div>
            <p className="demo-note"><span className="demo-note-dot" aria-hidden="true" /> Sample orders and PayPal test payments. No real money moves.</p>
          </div>

          <figure className="agreement-preview">
            <svg className="agreement-art" viewBox="0 0 680 650" role="img" aria-labelledby="agreement-art-title agreement-art-desc">
              <title id="agreement-art-title">An agreement in the cloud</title>
              <desc id="agreement-art-desc">A crystalline agreement made of tiny characters, floating in the clouds.</desc>
              <defs>
                <radialGradient id="crystal-glow"><stop stopColor="#a9d7e4" stopOpacity=".38" /><stop offset="1" stopColor="#9cc9e3" stopOpacity="0" /></radialGradient>
                <linearGradient id="crystal-left" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c4e4ed" stopOpacity=".38" /><stop offset="1" stopColor="#325c77" stopOpacity=".32" /></linearGradient>
                <linearGradient id="crystal-right" x1="1" y1="0" x2="0" y2="1"><stop stopColor="#c9e5eb" stopOpacity=".28" /><stop offset="1" stopColor="#162e4d" stopOpacity=".48" /></linearGradient>
                <linearGradient id="crystal-page" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d9f0ed" stopOpacity=".29" /><stop offset="1" stopColor="#8ab4c6" stopOpacity=".09" /></linearGradient>
                <pattern id="ascii-pattern" width="72" height="48" patternUnits="userSpaceOnUse">
                  <text x="0" y="10" fill="#ebfcff" fillOpacity=".56" fontFamily="monospace" fontSize="8" letterSpacing="1.4">. + : * . / + :</text>
                  <text x="1" y="22" fill="#e3f8ff" fillOpacity=".38" fontFamily="monospace" fontSize="8" letterSpacing="1.4">: . / . + : . *</text>
                  <text x="0" y="34" fill="#f1ffff" fillOpacity=".55" fontFamily="monospace" fontSize="8" letterSpacing="1.4">+ * . : / . + .</text>
                  <text x="1" y="46" fill="#daefff" fillOpacity=".4" fontFamily="monospace" fontSize="8" letterSpacing="1.4">. : + . * : / .</text>
                </pattern>
              </defs>
              <ellipse cx="340" cy="322" rx="320" ry="298" fill="url(#crystal-glow)" />
              <g className="crystal-object">
                <path d="M340 55 165 205 209 441 340 575 471 441 515 205Z" fill="#94c7d7" fillOpacity=".09" stroke="#d9f5f4" strokeOpacity=".68" strokeWidth="1.2" />
                <path d="M340 55 165 205 276 244Z" fill="#d8eff0" fillOpacity=".22" /><path d="M340 55 276 244 404 244Z" fill="#b9e1ea" fillOpacity=".18" /><path d="M340 55 404 244 515 205Z" fill="#e6f8f3" fillOpacity=".14" />
                <path d="M165 205 209 441 276 385 276 244Z" fill="url(#crystal-left)" /><path d="M515 205 471 441 404 385 404 244Z" fill="url(#crystal-right)" />
                <path d="M209 441 276 385 340 575Z" fill="#81b5cb" fillOpacity=".16" /><path d="M471 441 404 385 340 575Z" fill="#c5e6e7" fillOpacity=".13" /><path d="M276 385 340 575 404 385Z" fill="#d8f2ec" fillOpacity=".2" />
                <path d="M340 55 165 205 209 441 340 575 471 441 515 205Z" fill="url(#ascii-pattern)" opacity=".85" />
                <path d="M340 55 276 244 165 205M340 55 404 244 515 205M165 205 276 385 209 441M515 205 404 385 471 441M276 385 340 575 404 385M276 244h128" fill="none" stroke="#e3fafa" strokeOpacity=".42" strokeWidth="1" />
              </g>
              <g transform="rotate(-6 340 315)">
                  <path d="M261 190h126l33 33v182H261Z" fill="url(#crystal-page)" stroke="#ecffff" strokeOpacity=".8" strokeWidth="1.5" />
                  <path d="M387 190v33h33" fill="none" stroke="#ecffff" strokeOpacity=".6" />
                  <text x="280" y="221" fill="#e9fbfb" fontFamily="monospace" fontSize="10" letterSpacing="1">PACT / REVISION</text>
                  <path d="M280 247h105M280 261h92M280 275h108" stroke="#e6f7f5" strokeOpacity=".62" strokeWidth="2" />
                  <rect x="276" y="291" width="119" height="25" rx="2" fill="#d3f0dd" fillOpacity=".75" />
                  <text x="283" y="308" fill="#173d4c" fontFamily="monospace" fontSize="10" fontWeight="700">CHANGE REVIEW</text>
                  <path d="M280 337h102M280 351h82M280 365h109" stroke="#e6f7f5" strokeOpacity=".58" strokeWidth="2" />
                  <path d="M280 388h42m21 0h42" stroke="#f4ffff" strokeOpacity=".8" />
              </g>
              <g fill="#e4f8f9"><circle cx="138" cy="208" r="2" /><circle cx="540" cy="355" r="2" /><circle cx="462" cy="87" r="1.5" /><circle cx="188" cy="492" r="1.5" /></g>
              <g fill="none" stroke="#d8f4f5" strokeOpacity=".7"><path d="M105 314h14m-7-7v14M544 150h12m-6-6v12M492 510h10m-5-5v10" /></g>
            </svg>
          </figure>
        </section>

        <section className="how-section" id="how-it-works" aria-labelledby="how-title">
          <div className="how-heading"><h2 id="how-title">How it works</h2></div>
          <ol className="flow">
            <li><h3>Add the request</h3><p>Paste a customer’s message, or let them send one from their review page.</p></li>
            <li><h3>Review the details</h3><p>Check Pact’s suggestions, fill in any gaps and set the price.</p></li>
            <li><h3>Get approval</h3><p>Share the updated agreement for your customer to review and approve.</p></li>
            <li><h3>Release the work</h3><p>Once the requirements are met, share the current job sheet with your team.</p></li>
          </ol>
        </section>
        <footer className="landing-footer"><Brand /><span>PayPal sandbox · Sample data</span></footer>
      </main>
    </div>
  );
}
