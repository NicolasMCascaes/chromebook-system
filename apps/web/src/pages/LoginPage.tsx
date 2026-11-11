import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { StatusMessage } from "../components/StatusMessage";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

const RATE_LIMITED = "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
const SEND_FAILED = "Não foi possível enviar o link agora. Tente novamente em instantes.";

export function LoginPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    setState({ kind: "sending" });
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error?.status === 429) {
      setState({ kind: "error", message: RATE_LIMITED });
      return;
    }
    if (error && (error.status === undefined || error.status >= 500)) {
      setState({ kind: "error", message: SEND_FAILED });
      return;
    }
    setState({ kind: "sent", email: normalized });
  }

  return (
    <main className="full-page">
      <section className="card login-card">
        <h1>Agenda de Chromebooks</h1>
        <p className="muted">Informe seu e-mail institucional para receber um link de acesso.</p>

        {state.kind === "sent" ? (
          <StatusMessage kind="success">
            Se <strong>{state.email}</strong> estiver autorizado, você receberá um link de acesso em instantes. Verifique
            também a caixa de spam.
          </StatusMessage>
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
            {state.kind === "error" && <StatusMessage kind="error">{state.message}</StatusMessage>}
            <button type="submit" className="button primary" disabled={state.kind === "sending"}>
              {state.kind === "sending" ? "Enviando…" : "Receber link de acesso"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
