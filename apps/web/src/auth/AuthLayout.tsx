import { Outlet } from "react-router";
import { AuthProvider } from "./AuthProvider";

export function AuthLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
