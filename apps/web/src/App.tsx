import { Navigate, Route, Routes } from "react-router";
import { RequireAdmin, RequireAuth } from "./auth/guards";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { AgendaPage } from "./pages/AgendaPage";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { CartsPage } from "./pages/admin/CartsPage";
import { ChromebooksPage } from "./pages/admin/ChromebooksPage";
import { UsersPage } from "./pages/admin/UsersPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<AgendaPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="carrinhos" replace />} />
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
