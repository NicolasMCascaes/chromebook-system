import { NavLink, Outlet } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentUser } from "../auth/guards";

export function AppLayout() {
  const user = useCurrentUser();
  const { signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">Agenda de Chromebooks</span>
        <nav className="app-nav" aria-label="Principal">
          <NavLink to="/" end>
            Agenda
          </NavLink>
          {user.role === "ADMIN" && <NavLink to="/admin">Administração</NavLink>}
        </nav>
        <div className="user-box">
          <span className="muted">{user.name}</span>
          <button type="button" className="button link" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
