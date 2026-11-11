import { NavLink, Outlet } from "react-router";

export function AdminLayout() {
  return (
    <section className="page">
      <header className="page-header">
        <h1>Administração</h1>
      </header>
      <nav className="tabs" aria-label="Administração">
        <NavLink to="/admin/carrinhos">Carrinhos</NavLink>
        <NavLink to="/admin/chromebooks">Chromebooks</NavLink>
        <NavLink to="/admin/usuarios">Usuários</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
