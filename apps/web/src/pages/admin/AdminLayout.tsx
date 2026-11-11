import { useEffect } from "react";
import { NavLink, Outlet } from "react-router";
import { useAdminSettings, usePendingReservations } from "../../api/hooks";
import { rememberAccessCode } from "../../lib/access-code";

export function AdminLayout() {
  const settings = useAdminSettings();
  const accessCode = settings.data?.publicAccessCode;
  const pendingCount = usePendingReservations().data?.length ?? 0;

  useEffect(() => {
    if (accessCode) rememberAccessCode(accessCode);
  }, [accessCode]);

  return (
    <section className="page">
      <header className="page-header">
        <h1>Administração do TI</h1>
      </header>
      <nav className="tabs" aria-label="Administração do TI">
        <NavLink to="/admin/reservas">
          Reservas
          {pendingCount > 0 && (
            <span className="tab-count" aria-label={`${pendingCount} aguardando aprovação`}>
              {pendingCount}
            </span>
          )}
        </NavLink>
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
