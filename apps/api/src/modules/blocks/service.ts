import type { z } from "zod";
import { schoolNow, type AdminReservationDto, type BlockDto, type BlockMutationDto, type blockInputSchema } from "@chromebook/shared";
import type { AppContainer } from "@/lib/container";
import type { AuthUser } from "@/lib/auth/authenticate";
import { AppError } from "@/lib/http/errors";
import { listUpcomingActiveReservations } from "@/modules/reservations/repository";
import { toAdminReservationDto } from "@/modules/reservations/mapper";
import { startsInFuture } from "@/modules/reservations/rules";
import { findCartForReservation } from "@/modules/carts/repository";
import { deleteBlock, findBlockView, insertBlock, listBlockViews, toBlockDto, updateBlock } from "./repository";

export type BlockInput = z.output<typeof blockInputSchema>;

export async function listBlocksOfYear(container: AppContainer, year: number): Promise<BlockDto[]> {
  const rows = await listBlockViews(container.db, { from: `${year}-01-01`, to: `${year}-12-31` });
  return rows.map(toBlockDto);
}

export async function findAffectedReservations(container: AppContainer, input: BlockInput): Promise<AdminReservationDto[]> {
  const now = schoolNow(container.clock.now());
  const from = input.startDate > now.date ? input.startDate : now.date;
  if (from > input.endDate) return [];
  const rows = await listUpcomingActiveReservations(container.db, { from, to: input.endDate, cartId: input.cartId });
  return rows
    .filter((row) => startsInFuture(row.reservationDate, row.startTime, now))
    .map((row) => toAdminReservationDto(row, now));
}

async function assertCartExists(container: AppContainer, cartId: string | null): Promise<void> {
  if (cartId && !(await findCartForReservation(container.db, cartId))) {
    throw AppError.validation("Carrinho não encontrado.", [{ path: "cartId", message: "Carrinho não encontrado." }]);
  }
}

async function mutationResult(container: AppContainer, id: string, input: BlockInput): Promise<BlockMutationDto> {
  const view = await findBlockView(container.db, id);
  return { block: toBlockDto(view!), affectedReservations: await findAffectedReservations(container, input) };
}

export async function createBlock(container: AppContainer, admin: AuthUser, input: BlockInput): Promise<BlockMutationDto> {
  await assertCartExists(container, input.cartId);
  const id = await insertBlock(container.db, { ...input, createdBy: admin.id });
  return mutationResult(container, id, input);
}

export async function editBlock(container: AppContainer, id: string, input: BlockInput): Promise<BlockMutationDto> {
  await assertCartExists(container, input.cartId);
  if (!(await updateBlock(container.db, id, input))) throw AppError.notFound("Bloqueio não encontrado.");
  return mutationResult(container, id, input);
}

export async function removeBlock(container: AppContainer, id: string): Promise<void> {
  if (!(await deleteBlock(container.db, id))) throw AppError.notFound("Bloqueio não encontrado.");
}
