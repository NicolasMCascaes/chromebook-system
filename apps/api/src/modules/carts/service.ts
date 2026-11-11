import type { z } from "zod";
import type { CartDto, cartInputSchema, cartUpdateSchema } from "@chromebook/shared";
import type { AppContainer } from "@/lib/container";
import { AppError } from "@/lib/http/errors";
import { isPgError, PG_UNIQUE_VIOLATION } from "@/lib/db/errors";
import { findCartWithEquipment, insertCart, listCartsWithEquipment, toCartDto, updateCart } from "./repository";

const DUPLICATE_NAME = "Já existe um carrinho com esse nome.";

function rethrowDuplicateName(error: unknown): never {
  if (isPgError(error, PG_UNIQUE_VIOLATION, "carts_name_key")) throw AppError.conflict(DUPLICATE_NAME);
  throw error;
}

export async function listCarts(container: AppContainer, options: { onlyActive: boolean }): Promise<CartDto[]> {
  const rows = await listCartsWithEquipment(container.db, options);
  return rows.map(toCartDto);
}

export async function getCart(container: AppContainer, id: string): Promise<CartDto> {
  const row = await findCartWithEquipment(container.db, id);
  if (!row) throw AppError.notFound("Carrinho não encontrado.");
  return toCartDto(row);
}

export async function createCart(container: AppContainer, input: z.output<typeof cartInputSchema>): Promise<CartDto> {
  try {
    const row = await insertCart(container.db, input);
    return getCart(container, row.id);
  } catch (error) {
    rethrowDuplicateName(error);
  }
}

export async function editCart(
  container: AppContainer,
  id: string,
  input: z.output<typeof cartUpdateSchema>,
): Promise<CartDto> {
  try {
    const row = await updateCart(container.db, id, input);
    if (!row) throw AppError.notFound("Carrinho não encontrado.");
    return getCart(container, row.id);
  } catch (error) {
    rethrowDuplicateName(error);
  }
}
