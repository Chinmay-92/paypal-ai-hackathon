import { Brand } from "@/ui/Brand";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <>
      <header className="topbar">
        <Brand />
      </header>
    <main id="main" className="narrow">
      <div className="panel" style={{ maxWidth: 420, margin: "3rem auto" }}>
        <h1>Sign in to Pact</h1>
        <p className="muted small">Synthetic demo accounts are created by the seed script. Sandbox only.</p>
        <LoginForm />
      </div>
    </main>
    </>
  );
}
