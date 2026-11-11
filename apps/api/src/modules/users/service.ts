import type { z } from "zod";
import type { userInputSchema, userUpdateSchema, UserDto } from "@chromebook/shared";
import type { AppContainer } from "@/lib/container";
import type { AuthUser } from "@/lib/auth/authenticate";
import { AppError } from "@/lib/http/errors";
import { isPgError, PG_UNIQUE_VIOLATION } from "@/lib/db/errors";
import { findUserByEmail, insertUser, listUsers, toUserDto, updateUser } from "./repository";

const EMAIL_ALREADY_AUTHORIZED = "Este e-mail já está autorizado.";

export async function listAuthorizedUsers(container: AppContainer): Promise<UserDto[]> {
  const rows = await listUsers(container.db);
  return rows.map(toUserDto);
}

export async function authorizeUser(
  container: AppContainer,
  input: z.output<typeof userInputSchema>,
): Promise<UserDto> {
  if (await findUserByEmail(container.db, input.email)) {
    throw AppError.conflict(EMAIL_ALREADY_AUTHORIZED);
  }
  const authUserId = await container.authAdmin.ensureUser(input.email);
  try {
    const row = await insertUser(container.db, {
      id: authUserId,
      email: input.email,
      name: input.name,
      role: input.role,
      active: true,
    });
    return toUserDto(row);
  } catch (error) {
    if (isPgError(error, PG_UNIQUE_VIOLATION)) throw AppError.conflict(EMAIL_ALREADY_AUTHORIZED);
    throw error;
  }
}

export async function updateUserAccess(
  container: AppContainer,
  actor: AuthUser,
  userId: string,
  input: z.output<typeof userUpdateSchema>,
): Promise<UserDto> {
  if (userId === actor.id && (input.active === false || (input.role !== undefined && input.role !== "ADMIN"))) {
    throw AppError.validation("Você não pode remover o seu próprio acesso de administrador.");
  }
  const row = await updateUser(container.db, userId, input);
  if (!row) throw AppError.notFound("Usuário não encontrado.");
  return toUserDto(row);
}
