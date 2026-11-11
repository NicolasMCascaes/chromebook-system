import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { getSupabase } from "../lib/supabase";
import { env } from "../lib/env";
import { DevLoginPanel } from "../auth/DevLoginPanel";
import { useAuth } from "../auth/AuthProvider";
import { StatusMessage } from "../components/StatusMessage";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string };

const INVALID_CREDENTIALS = "E-mail ou senha incorretos.";
const RATE_LIMITED = "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
const SIGN_IN_FAILED = "Não foi possível entrar agora. Tente novamente em instantes.";

export function LoginPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  if (session) return <Navigate to="/admin" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) return;
    setState({ kind: "sending" });
    const { error } = await getSupabase().auth.signInWithPassword({ email: normalized, password });
    if (!error) return;
    if (error.status === 429) setState({ kind: "error", message: RATE_LIMITED });
    else if (error.status === 400) setState({ kind: "error", message: INVALID_CREDENTIALS });
    else setState({ kind: "error", message: SIGN_IN_FAILED });
  }

  return (
    <main className="full-page">
      <section className="card login-card">
        <h1>Área do TI</h1>
        <p className="muted">Entre com o e-mail e a senha cadastrados pelo TI.</p>

        {env.devAuth ? (
          <DevLoginPanel />
        ) : (
          <form onSubmit={handleSubmit} className="form">
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={state.kind === "sending"}
              />
            </label>
            <label className="field">
              <span>Senha</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={state.kind === "sending"}
              />
            </label>
            {state.kind === "error" && <StatusMessage kind="error">{state.message}</StatusMessage>}
            <button type="submit" className="button primary" disabled={state.kind === "sending"}>
              {state.kind === "sending" ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
