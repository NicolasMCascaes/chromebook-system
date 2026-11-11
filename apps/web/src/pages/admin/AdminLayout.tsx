import { NavLink, Outlet } from "react-router";

export function AdminLayout() {
  return (
    <section className="page">
      <header className="page-header">
        <h1>Coordenação</h1>
      </header>
      <nav className="tabs" aria-label="Coordenação">
        <NavLink to="/admin/reservas">Reservas</NavLink>
        <NavLink to="/admin/bloqueios">Bloqueios e feriados</NavLink>
        <NavLink to="/admin/configuracoes">Configurações</NavLink>
        <NavLink to="/admin/carrinhos">Carrinhos</NavLink>
        <NavLink to="/admin/chromebooks">Chromebooks</NavLink>
        <NavLink to="/admin/usuarios">Usuários</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
