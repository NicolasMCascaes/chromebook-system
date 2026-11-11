import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router";
import { PublicLayout } from "./components/PublicLayout";
import { StatusMessage } from "./components/StatusMessage";
import { AgendaPage } from "./pages/AgendaPage";

function lazyPage<T, K extends keyof T>(load: () => Promise<T>, name: K & (T[K] extends ComponentType ? K : never)) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const AuthLayout = lazyPage(() => import("./auth/AuthLayout"), "AuthLayout");
const RequireAuth = lazyPage(() => import("./auth/guards"), "RequireAuth");
const RequireAdmin = lazyPage(() => import("./auth/guards"), "RequireAdmin");
const AppLayout = lazyPage(() => import("./components/AppLayout"), "AppLayout");
const LoginPage = lazyPage(() => import("./pages/LoginPage"), "LoginPage");
const AuthCallbackPage = lazyPage(() => import("./pages/AuthCallbackPage"), "AuthCallbackPage");
const ApprovalPage = lazyPage(() => import("./pages/ApprovalPage"), "ApprovalPage");
const AdminLayout = lazyPage(() => import("./pages/admin/AdminLayout"), "AdminLayout");
const CartsPage = lazyPage(() => import("./pages/admin/CartsPage"), "CartsPage");
const ChromebooksPage = lazyPage(() => import("./pages/admin/ChromebooksPage"), "ChromebooksPage");
const UsersPage = lazyPage(() => import("./pages/admin/UsersPage"), "UsersPage");
const ReservationsPage = lazyPage(() => import("./pages/admin/ReservationsPage"), "ReservationsPage");
const BlocksPage = lazyPage(() => import("./pages/admin/BlocksPage"), "BlocksPage");
const SettingsPage = lazyPage(() => import("./pages/admin/SettingsPage"), "SettingsPage");
const PrintDayPage = lazyPage(() => import("./pages/admin/PrintDayPage"), "PrintDayPage");

function LazyOutlet() {
  return (
    <Suspense fallback={<StatusMessage kind="loading">Carregando…</StatusMessage>}>
      <Outlet />
    </Suspense>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<LazyOutlet />}>
        <Route element={<PublicLayout />}>
          <Route index element={<AgendaPage />} />
          <Route path="aprovacao" element={<ApprovalPage />} />
        </Route>
        <Route path="/login" element={<Navigate to="/admin/login" replace />} />
        <Route element={<AuthLayout />}>
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<RequireAdmin />}>
              <Route path="admin/impressao" element={<PrintDayPage />} />
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
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
