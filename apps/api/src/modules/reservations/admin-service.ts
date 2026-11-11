import type { z } from "zod";
import {
  CALENDAR_BLOCK_KIND_LABELS,
  isActiveReservationStatus,
  normalizeTime,
  schoolNow,
  type AdminReservationDto,
  type adminReservationQuerySchema,
  type reservationUpdateSchema,
} from "@chromebook/shared";
import type { AppContainer } from "@/lib/container";
import { AppError } from "@/lib/http/errors";
import { isPgError, isRetryableTransactionError, PG_EXCLUSION_VIOLATION } from "@/lib/db/errors";
import { getSchoolHours } from "@/modules/settings/repository";
import { findBlockingEntry } from "@/modules/blocks/repository";
import { findCartForReservation } from "@/modules/carts/repository";
import { findReservationView, listReservationsForAdmin, updateReservationFields } from "./repository";
import { assertDateAndTimeRules, assertWithinSchoolHours, ruleViolation, startsInFuture } from "./rules";
import { toAdminReservationDto } from "./mapper";
import { RESERVATION_CONFLICT_MESSAGE } from "./service";

const MAX_TRANSACTION_ATTEMPTS = 3;

export async function listAdminReservations(
  container: AppContainer,
  query: z.output<typeof adminReservationQuerySchema>,
): Promise<AdminReservationDto[]> {
  const now = schoolNow(container.clock.now());
  const rows = await listReservationsForAdmin(container.db, query);
  return rows.map((row) => toAdminReservationDto(row, now));
}

export async function editReservation(
  container: AppContainer,
  id: string,
  input: z.output<typeof reservationUpdateSchema>,
): Promise<AdminReservationDto> {
  const { db, clock } = container;
  const now = schoolNow(clock.now());

  const current = await findReservationView(db, id);
  if (!current) throw AppError.notFound("Reserva não encontrada.");
  if (!isActiveReservationStatus(current.status)) {
    throw ruleViolation("RESERVATION_CANCELLED", "Reservas canceladas ou recusadas não podem ser alteradas.");
  }

  const slot = {
    cartId: input.cartId ?? current.cartId,
    date: input.date ?? current.reservationDate,
    startTime: input.startTime ?? normalizeTime(current.startTime),
    endTime: input.endTime ?? normalizeTime(current.endTime),
  };
  const scheduleChanged =
    slot.cartId !== current.cartId ||
    slot.date !== current.reservationDate ||
    slot.startTime !== normalizeTime(current.startTime) ||
    slot.endTime !== normalizeTime(current.endTime);

  if (scheduleChanged) {
    if (!startsInFuture(current.reservationDate, current.startTime, now)) {
      throw ruleViolation("RESERVATION_STARTED", "Não é possível remarcar uma reserva que já começou ou terminou.");
    }
    assertDateAndTimeRules(slot, now);
  }

  const changes = {
    teacherName: input.teacherName,
    className: input.className,
    notes: input.notes,
    ...(scheduleChanged
      ? { cartId: slot.cartId, reservationDate: slot.date, startTime: slot.startTime, endTime: slot.endTime }
      : {}),
  };
  if (Object.values(changes).every((value) => value === undefined)) return toAdminReservationDto(current, now);

  const applyWithinTransaction = () =>
    db.transaction(async (tx) => {
      if (scheduleChanged) {
        assertWithinSchoolHours(slot, await getSchoolHours(tx, { lockForShare: true }));
        const cart = await findCartForReservation(tx, slot.cartId);
        if (!cart || !cart.active) {
          throw ruleViolation("CART_UNAVAILABLE", "O carrinho selecionado não está disponível para reservas.");
        }
        const block = await findBlockingEntry(tx, slot.cartId, slot.date);
        if (block) {
          throw ruleViolation(
            "DATE_BLOCKED",
            `Esta data não está disponível para reservas (${CALENDAR_BLOCK_KIND_LABELS[block.kind]}: ${block.reason}).`,
          );
        }
      }
      return updateReservationFields(tx, id, changes);
    });

  for (let attempt = 1; ; attempt++) {
    try {
      const updated = await applyWithinTransaction();
      if (!updated) throw ruleViolation("RESERVATION_CANCELLED", "Reservas canceladas ou recusadas não podem ser alteradas.");
      break;
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
      if (isPgError(error, PG_EXCLUSION_VIOLATION, "reservations_no_overlap")) {
        throw AppError.conflict(RESERVATION_CONFLICT_MESSAGE, "RESERVATION_CONFLICT");
      }
      throw error;
    }
  }

  const view = await findReservationView(db, id);
  return toAdminReservationDto(view!, now);
}
