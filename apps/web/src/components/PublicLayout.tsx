import { Outlet } from "react-router";
import { ThemeToggle } from "./ThemeToggle";

export function PublicLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">Agenda de Chromebooks</span>
        <div className="user-box">
          <ThemeToggle />
        </div>
      </header>
      <main className="app-main is-wide">
        <Outlet />
      </main>
    </div>
  );
}
