import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Ghost, LockKeyhole, Mail, UserRound } from "lucide-react";
import {
  loginAccount,
  registerAccount,
  type AuthSession,
} from "../lib/auth";
import { cloudRedirectUrl, cloudSession, getSupabaseClient, supabaseConfigured } from "../lib/supabase";

type Props = {
  onAuthenticated: (session: AuthSession) => void;
  /** Browse the demo workspace without an account. */
  onGuest?: () => void;
};

export function AuthScreen({ onAuthenticated, onGuest }: Props) {
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
  const [showPassword, setShowPassword] = useState(false);
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
      if (active) setError(reason instanceof Error ? reason.message : "Não foi possível abrir a conta na nuvem.");
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
      setError("As palavras-passe não coincidem.");
      return;
    }
    setBusy(true);
    try {
      if (cloudAuth) {
        const client = await getSupabaseClient();
        if (!client) throw new Error("A conta na nuvem não está configurada.");
        if (mode === "reset-request") {
          const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: cloudRedirectUrl() });
          if (resetError) throw resetError;
          setNotice("Vê o teu email: enviámos um link seguro para repor a palavra-passe.");
          return;
        }
        if (mode === "reset-password") {
          const { error: updateError } = await client.auth.updateUser({ password });
          if (updateError) throw updateError;
          setNotice("Palavra-passe atualizada. A abrir o teu espaço…");
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
          else setNotice("Confirma a conta no link que enviámos por email e depois entra aqui.");
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
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar.");
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
          {mode === "register" ? "Cria a tua conta de rider." : mode === "login" ? "Bem-vindo de volta, rider." : mode === "reset-request" ? "Recupera a tua conta." : "Define uma nova palavra-passe."}
        </h1>
        <p className="auth-intro">
          As tuas runs, o teu Ghost e a afinação da bike num espaço privado.
        </p>
        {mode === "login" || mode === "register" ? <div className="auth-tabs" role="tablist" aria-label="Acesso à conta">
          <button
            className={mode === "register" ? "active" : ""}
            role="tab"
            aria-selected={mode === "register"}
            onClick={() => {
              setMode("register");
              setError(""); setNotice("");
            }}
          >
            Criar conta
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
            Entrar
          </button>
        </div> : <button className="text-button auth-back" type="button" onClick={() => { setMode("login"); setError(""); setNotice(""); }}><ArrowLeft size={14} /> Voltar a entrar</button>}
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && (
            <label className="field">
              <span>Nome</span>
              <div className="auth-input">
                <UserRound size={16} />
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="O teu nome"
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
            <span>Palavra-passe</span>
            <div className="auth-input">
              <LockKeyhole size={16} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "register" || mode === "reset-password" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                required
              />
              <button
                type="button"
                className="auth-reveal"
                aria-label={showPassword ? "Esconder palavra-passe" : "Mostrar palavra-passe"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>}
          {(mode === "register" || mode === "reset-password") && (
            <label className="field">
              <span>Confirmar palavra-passe</span>
              <div className="auth-input">
                <LockKeyhole size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Repete a palavra-passe"
                  required
                />
              </div>
            </label>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          {mode === "login" && cloudAuth && <button className="text-button auth-forgot" type="button" onClick={() => { setMode("reset-request"); setError(""); setNotice(""); }}>Esqueceste a palavra-passe?</button>}
          <button className="button primary auth-submit" disabled={busy} type="submit">
            {busy ? "A abrir…" : mode === "register" ? "Criar conta" : mode === "login" ? "Entrar" : mode === "reset-request" ? "Enviar link" : "Atualizar palavra-passe"}
            <ArrowRight size={16} />
          </button>
        </form>
        {onGuest && (mode === "login" || mode === "register") && (
          <button className="text-button auth-guest" type="button" onClick={onGuest}>
            Ver a demonstração sem conta <ArrowRight size={14} />
          </button>
        )}
        <p className="auth-footnote">
          {cloudAuth ? "Conta segura, recuperação de palavra-passe e espaço em vários dispositivos com Supabase." : "Esta versão guarda contas e runs neste dispositivo. Configura o Supabase para teres contas reais, recuperação de palavra-passe e sincronização na nuvem."}
        </p>
      </section>
    </main>
  );
}
