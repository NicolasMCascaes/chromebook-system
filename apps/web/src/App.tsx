import { Navigate, Route, Routes } from "react-router";
import { RequireAdmin, RequireAuth } from "./auth/guards";
import { AppLayout } from "./components/AppLayout";
import { PublicLayout } from "./components/PublicLayout";
import { LoginPage } from "./pages/LoginPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { AgendaPage } from "./pages/AgendaPage";
import { ApprovalPage } from "./pages/ApprovalPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { CartsPage } from "./pages/admin/CartsPage";
import { ChromebooksPage } from "./pages/admin/ChromebooksPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { ReservationsPage } from "./pages/admin/ReservationsPage";
import { BlocksPage } from "./pages/admin/BlocksPage";
import { SettingsPage } from "./pages/admin/SettingsPage";

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<AgendaPage />} />
        <Route path="aprovacao" element={<ApprovalPage />} />
      </Route>
      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/login" element={<Navigate to="/admin/login" replace />} />
      <Route element={<RequireAuth />}>
        <Route element={<RequireAdmin />}>
          <Route element={<AppLayout />}>
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="reservas" replace />} />
              <Route path="reservas" element={<ReservationsPage />} />
              <Route path="bloqueios" element={<BlocksPage />} />
              <Route path="configuracoes" element={<SettingsPage />} />
              <Route path="carrinhos" element={<CartsPage />} />
              <Route path="chromebooks" element={<ChromebooksPage />} />
              <Route path="usuarios" element={<UsersPage />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
