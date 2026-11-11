import { useState, type FormEvent } from "react";
import { USER_ROLE_LABELS, userInputSchema, type UserDto } from "@chromebook/shared";
import { useAdminUsers, useAuthorizeUser, useUpdateUser } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { useCurrentUser } from "../../auth/guards";
import { StatusMessage } from "../../components/StatusMessage";
import { FieldError } from "../../components/FieldError";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "../../lib/form-errors";

function AuthorizeUserForm({ onDone }: { onDone: (message: string) => void }) {
  const [values, setValues] = useState({ email: "", name: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const authorize = useAuthorizeUser();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = userInputSchema.safeParse({ ...values, role: "ADMIN" });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    try {
      const user = await authorize.mutateAsync(parsed.data);
      setValues({ email: "", name: "" });
      onDone(`${user.email} autorizado. A pessoa já pode solicitar o link de acesso.`);
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <h2>Autorizar acesso do TI</h2>
      <p className="muted small-text">Professores não precisam de conta: eles reservam pelo link público da agenda.</p>
      <div className="form-grid">
        <label className="field">
          <span>E-mail</span>
          <input
            type="email"
            value={values.email}
            onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
          />
          <FieldError message={errors.email} />
        </label>
        <label className="field">
          <span>Nome</span>
          <input
            value={values.name}
            maxLength={100}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
          />
          <FieldError message={errors.name} />
        </label>
      </div>
      {authorize.isError && <StatusMessage kind="error">{errorMessage(authorize.error)}</StatusMessage>}
      <div className="actions">
        <button type="submit" className="button primary" disabled={authorize.isPending}>
          {authorize.isPending ? "Autorizando…" : "Autorizar"}
        </button>
      </div>
    </form>
  );
}

function UserRow({ user, isSelf, onError }: { user: UserDto; isSelf: boolean; onError: (message: string) => void }) {
  const update = useUpdateUser();
  const [confirming, setConfirming] = useState(false);

  const change = (input: { active: boolean }) =>
    update.mutate(
      { id: user.id, input },
      { onError: (error) => onError(errorMessage(error)), onSettled: () => setConfirming(false) },
    );

  return (
    <tr className={user.active ? undefined : "row-inactive"}>
      <td>{user.name}</td>
      <td>{user.email}</td>
      <td>{USER_ROLE_LABELS[user.role]}</td>
      <td>{user.active ? "Ativo" : "Desativado"}</td>
      <td>
        {!isSelf && confirming && (
          <span className="inline-confirm">
            <span>Desativar {user.name}? O acesso à área do TI é encerrado na hora.</span>
            <button type="button" className="button link" disabled={update.isPending} onClick={() => setConfirming(false)}>
              Voltar
            </button>
            <button type="button" className="button link danger-text" disabled={update.isPending} onClick={() => change({ active: false })}>
              Confirmar
            </button>
          </span>
        )}
        {!isSelf && !confirming && (
          <button
            type="button"
            className="button link"
            disabled={update.isPending}
            onClick={() => (user.active ? setConfirming(true) : change({ active: true }))}
          >
            {user.active ? "Desativar" : "Reativar"}
          </button>
        )}
      </td>
    </tr>
  );
}

export function UsersPage() {
  const currentUser = useCurrentUser();
  const users = useAdminUsers();
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  return (
    <div className="stack">
      <AuthorizeUserForm onDone={(text) => setFeedback({ kind: "success", text })} />
      {feedback && <StatusMessage kind={feedback.kind}>{feedback.text}</StatusMessage>}

      {users.isPending && <StatusMessage kind="loading">Carregando usuários…</StatusMessage>}
      {users.isError && <StatusMessage kind="error">{errorMessage(users.error)}</StatusMessage>}

      {users.data && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.id === currentUser.id}
                  onError={(text) => setFeedback({ kind: "error", text })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
