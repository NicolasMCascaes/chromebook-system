import type { z } from "zod";
import type { ChromebookDto, ChromebookStatus, chromebookInputSchema, chromebookUpdateSchema } from "@chromebook/shared";
import type { AppContainer } from "@/lib/container";
import { AppError } from "@/lib/http/errors";
import { isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION } from "@/lib/db/errors";
import { findChromebook, insertChromebook, listChromebooks, toChromebookDto, updateChromebook } from "./repository";

function rethrowConstraintError(error: unknown): never {
  if (isPgError(error, PG_UNIQUE_VIOLATION, "chromebooks_asset_tag_key")) {
    throw AppError.conflict("Já existe um Chromebook com essa identificação.");
  }
  if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
    throw AppError.validation("Carrinho não encontrado.", [{ path: "cartId", message: "Carrinho não encontrado." }]);
  }
  throw error;
}

export async function listChromebooksForAdmin(
  container: AppContainer,
  filters: { cartId?: string; status?: ChromebookStatus },
): Promise<ChromebookDto[]> {
  const rows = await listChromebooks(container.db, filters);
  return rows.map(toChromebookDto);
}

export async function getChromebook(container: AppContainer, id: string): Promise<ChromebookDto> {
  const row = await findChromebook(container.db, id);
  if (!row) throw AppError.notFound("Chromebook não encontrado.");
  return toChromebookDto(row);
}

export async function createChromebook(
  container: AppContainer,
  input: z.output<typeof chromebookInputSchema>,
): Promise<ChromebookDto> {
  try {
    const row = await insertChromebook(container.db, input);
    return getChromebook(container, row.id);
  } catch (error) {
    rethrowConstraintError(error);
  }
}

export async function editChromebook(
  container: AppContainer,
  id: string,
  input: z.output<typeof chromebookUpdateSchema>,
): Promise<ChromebookDto> {
  try {
    const row = await updateChromebook(container.db, id, input);
    if (!row) throw AppError.notFound("Chromebook não encontrado.");
    return getChromebook(container, row.id);
  } catch (error) {
    rethrowConstraintError(error);
  }
}
