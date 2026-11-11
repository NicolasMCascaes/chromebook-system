import { useState, type FormEvent } from "react";
import { USER_ROLE_LABELS, USER_ROLES, userInputSchema, type UserDto, type UserRole } from "@chromebook/shared";
import { useAdminUsers, useAuthorizeUser, useUpdateUser } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { useCurrentUser } from "../../auth/guards";
import { StatusMessage } from "../../components/StatusMessage";
import { FieldError } from "../../components/FieldError";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "../../lib/form-errors";

function AuthorizeUserForm({ onDone }: { onDone: (message: string) => void }) {
  const [values, setValues] = useState({ email: "", name: "", role: "PROFESSOR" as UserRole });
  const [errors, setErrors] = useState<FieldErrors>({});
  const authorize = useAuthorizeUser();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = userInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    try {
      const user = await authorize.mutateAsync(parsed.data);
      setValues({ email: "", name: "", role: "PROFESSOR" });
      onDone(`${user.email} autorizado. A pessoa já pode solicitar o link de acesso.`);
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <h2>Autorizar e-mail</h2>
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
        <label className="field">
          <span>Perfil</span>
          <select
            value={values.role}
            onChange={(event) => setValues((current) => ({ ...current, role: event.target.value as UserRole }))}
          >
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {USER_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
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

  const change = (input: { role?: UserRole; active?: boolean }) =>
    update.mutate({ id: user.id, input }, { onError: (error) => onError(errorMessage(error)) });

  return (
    <tr className={user.active ? undefined : "row-inactive"}>
      <td>{user.name}</td>
      <td>{user.email}</td>
      <td>
        <select
          aria-label={`Perfil de ${user.name}`}
          value={user.role}
          disabled={isSelf || update.isPending}
          onChange={(event) => change({ role: event.target.value as UserRole })}
        >
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {USER_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </td>
      <td>{user.active ? "Ativo" : "Desativado"}</td>
      <td>
        {!isSelf && (
          <button type="button" className="button link" disabled={update.isPending} onClick={() => change({ active: !user.active })}>
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
