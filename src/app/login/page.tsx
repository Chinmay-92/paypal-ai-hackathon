import { Brand } from "@/ui/Brand";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <>
      <header className="topbar">
        <Brand />
      </header>
      <main id="main" className="auth-page">
        <div className="auth-intro">
          <h1>Manage orders<br />and projects.</h1>
          <p>Sign in to review changes, track payments and update your team.</p>
        </div>
        <div className="panel auth-card">
          <h2>Sign in</h2>
          <p className="muted small">Use your demo account to sign in. Payments are for testing only.</p>
          <LoginForm />
        </div>
      </main>
    </>
  );
}
