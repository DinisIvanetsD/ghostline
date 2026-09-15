import { useState, type FormEvent } from "react";
import { ArrowRight, Ghost, LockKeyhole, Mail, UserRound } from "lucide-react";
import {
  loginAccount,
  registerAccount,
  type AuthSession,
} from "../lib/auth";

type Props = { onAuthenticated: (session: AuthSession) => void };

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const session =
        mode === "register"
          ? await registerAccount({ name, email, password })
          : await loginAccount({ email, password });
      onAuthenticated(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-mark" aria-hidden="true">
          <Ghost size={27} />
        </div>
        <p className="auth-kicker">GHOSTLINE.</p>
        <h1 id="auth-title">
          {mode === "register" ? "Create your rider account." : "Welcome back, rider."}
        </h1>
        <p className="auth-intro">
          Your runs, Ghost and bike setup in one private workspace.
        </p>
        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button
            className={mode === "register" ? "active" : ""}
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            Create account
          </button>
          <button
            className={mode === "login" ? "active" : ""}
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Sign in
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && (
            <label className="field">
              <span>Name</span>
              <div className="auth-input">
                <UserRound size={16} />
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Dinis Ivanets"
                  required
                />
              </div>
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <div className="auth-input">
              <Mail size={16} />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="rider@example.com"
                required
              />
            </div>
          </label>
          <label className="field">
            <span>Password</span>
            <div className="auth-input">
              <LockKeyhole size={16} />
              <input
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="8 characters minimum"
                required
              />
            </div>
          </label>
          {mode === "register" && (
            <label className="field">
              <span>Confirm password</span>
              <div className="auth-input">
                <LockKeyhole size={16} />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Repeat your password"
                  required
                />
              </div>
            </label>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button primary auth-submit" disabled={busy} type="submit">
            {busy ? "Opening workspace…" : mode === "register" ? "Create account" : "Sign in"}
            <ArrowRight size={16} />
          </button>
        </form>
        <p className="auth-footnote">
          Accounts stay on this device for now. Cloud sync is ready for a future release.
        </p>
      </section>
    </main>
  );
}
