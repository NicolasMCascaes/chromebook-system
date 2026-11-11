import type { UserRole } from "@chromebook/shared";
import type { AppContainer } from "../container";
import { AppError } from "../http/errors";
import { findUserById } from "@/modules/users/repository";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export async function authenticate(request: Request, container: AppContainer): Promise<AuthUser> {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  if (!match?.[1]) throw AppError.unauthorized("Faça login para continuar.");

  const { userId } = await container.tokenVerifier.verify(match[1]);
  const user = await findUserById(container.db, userId);
  if (!user || !user.active) {
    throw AppError.forbidden("Seu acesso não está autorizado. Procure o administrador da escola.");
  }
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function requireAdmin(user: AuthUser): void {
  if (user.role !== "ADMIN") throw AppError.forbidden();
}

export async function authenticateAdmin(request: Request, container: AppContainer): Promise<AuthUser> {
  const user = await authenticate(request, container);
  requireAdmin(user);
  return user;
}

export async function authenticateAdminIfPresent(request: Request, container: AppContainer): Promise<AuthUser | null> {
  if (!request.headers.has("authorization")) return null;
  return authenticateAdmin(request, container);
}
