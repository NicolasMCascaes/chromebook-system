import { createHash, timingSafeEqual } from "node:crypto";
import type { UserRole } from "@chromebook/shared";
import type { AppContainer } from "../container";
import { AppError } from "../http/errors";
import { findUserById } from "@/modules/users/repository";
import { getPublicAccessCode } from "@/modules/settings/repository";

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

export const ACCESS_CODE_HEADER = "x-access-code";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export async function authorizePublicAccess(request: Request, container: AppContainer): Promise<AuthUser | null> {
  const admin = await authenticateAdminIfPresent(request, container);
  if (admin) return admin;
  const received = request.headers.get(ACCESS_CODE_HEADER);
  const expected = await getPublicAccessCode(container.db);
  if (!received || !timingSafeEqual(digest(received), digest(expected))) {
    throw new AppError(
      403,
      "ACCESS_CODE_INVALID",
      "Este link de acesso à agenda não é válido ou foi substituído. Peça o link atualizado ao TI.",
    );
  }
  return null;
}
