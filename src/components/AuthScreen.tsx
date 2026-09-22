import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Ghost, LockKeyhole, Mail, UserRound } from "lucide-react";
import {
  loginAccount,
  registerAccount,
  type AuthSession,
} from "../lib/auth";
import { cloudRedirectUrl, cloudSession, getSupabaseClient, supabaseConfigured } from "../lib/supabase";

type Props = { onAuthenticated: (session: AuthSession) => void };

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "register" | "reset-request" | "reset-password">(() =>
    typeof window !== "undefined" && /(?:type=recovery|recovery_token)/i.test(`${window.location.hash}${window.location.search}`)
      ? "reset-password"
      : "register",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const cloudAuth = supabaseConfigured;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void getSupabaseClient().then((client) => {
      if (!active || !client) return;
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        if (event === "PASSWORD_RECOVERY") {
          setMode("reset-password");
          setPassword("");
          setConfirm("");
        } else if (session && event === "INITIAL_SESSION" && !/(?:type=recovery|recovery_token)/i.test(`${window.location.hash}${window.location.search}`)) {
          // Defer auth calls until this listener has returned; Supabase warns
          // against calling auth APIs from inside onAuthStateChange callbacks.
          window.setTimeout(() => {
            if (active) onAuthenticated(cloudSession(session));
          }, 0);
        }
      });
      unsubscribe = () => subscription.unsubscribe();
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Cloud account could not be opened.");
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [onAuthenticated]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if ((mode === "register" || mode === "reset-password") && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (cloudAuth) {
        const client = await getSupabaseClient();
        if (!client) throw new Error("Cloud account is not configured.");
        if (mode === "reset-request") {
          const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: cloudRedirectUrl() });
          if (resetError) throw resetError;
          setNotice("Check your email for a secure password reset link.");
          return;
        }
        if (mode === "reset-password") {
          const { error: updateError } = await client.auth.updateUser({ password });
          if (updateError) throw updateError;
          setNotice("Password updated. Opening your rider workspace…");
          const { data } = await client.auth.getSession();
          if (data.session) onAuthenticated(cloudSession(data.session));
          return;
        }
        if (mode === "register") {
          const { data, error: signupError } = await client.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { name: name.trim() }, emailRedirectTo: cloudRedirectUrl() },
          });
          if (signupError) throw signupError;
          if (data.session) onAuthenticated(cloudSession(data.session));
          else setNotice("Check your email to confirm your account, then sign in here.");
          return;
        }
        const { data, error: loginError } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (loginError) throw loginError;
        if (data.session) onAuthenticated(cloudSession(data.session));
        return;
      }
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
          {mode === "register" ? "Create your rider account." : mode === "login" ? "Welcome back, rider." : mode === "reset-request" ? "Recover your account." : "Set a new password."}
        </h1>
        <p className="auth-intro">
          Your runs, Ghost and bike setup in one private workspace.
        </p>
        {mode === "login" || mode === "register" ? <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button
            className={mode === "register" ? "active" : ""}
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => {
              setMode("register");
              setError(""); setNotice("");
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
              setError(""); setNotice("");
            }}
          >
            Sign in
          </button>
        </div> : <button className="text-button auth-back" type="button" onClick={() => { setMode("login"); setError(""); setNotice(""); }}><ArrowLeft size={14} /> Back to sign in</button>}
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
          {mode !== "reset-password" && <label className="field">
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
          </label>}
          {mode !== "reset-request" && <label className="field">
            <span>Password</span>
            <div className="auth-input">
              <LockKeyhole size={16} />
              <input
                type="password"
                autoComplete={mode === "register" || mode === "reset-password" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="8 characters minimum"
                required
              />
            </div>
          </label>}
          {(mode === "register" || mode === "reset-password") && (
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
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          {mode === "login" && cloudAuth && <button className="text-button auth-forgot" type="button" onClick={() => { setMode("reset-request"); setError(""); setNotice(""); }}>Forgot password?</button>}
          <button className="button primary auth-submit" disabled={busy} type="submit">
            {busy ? "Opening workspace…" : mode === "register" ? "Create account" : mode === "login" ? "Sign in" : mode === "reset-request" ? "Send reset link" : "Update password"}
            <ArrowRight size={16} />
          </button>
        </form>
        <p className="auth-footnote">
          {cloudAuth ? "Secure account, password recovery and multi-device workspace powered by Supabase." : "This preview stores accounts and rides on this device. Configure Supabase to enable real accounts, password recovery and cloud sync."}
        </p>
      </section>
    </main>
  );
}
