import { createHash } from "node:crypto";
import type { z } from "zod";
import { CALENDAR_BLOCK_KIND_LABELS, schoolNow, type ReservationDto, type reservationInputSchema } from "@chromebook/shared";
import type { AppContainer } from "@/lib/container";
import type { AuthUser } from "@/lib/auth/authenticate";
import { AppError } from "@/lib/http/errors";
import { isPgError, isRetryableTransactionError, PG_EXCLUSION_VIOLATION } from "@/lib/db/errors";
import { getSchoolHours } from "@/modules/settings/repository";
import { findBlockingEntry } from "@/modules/blocks/repository";
import { findCartForReservation } from "@/modules/carts/repository";
import {
  findReservationByIdempotencyKey,
  findReservationView,
  insertReservationIfNew,
  markReservationCancelled,
  type ReservationView,
} from "./repository";
import { assertDateAndTimeRules, assertWithinSchoolHours, ruleViolation, startsInFuture } from "./rules";
import { toReservationDto } from "./mapper";

export type ReservationInput = z.output<typeof reservationInputSchema>;

export interface CreateReservationResult {
  reservation: ReservationDto;
  replayed: boolean;
}

const MAX_TRANSACTION_ATTEMPTS = 3;

export const RESERVATION_CONFLICT_MESSAGE =
  "Este carrinho já foi reservado em parte desse horário. A disponibilidade foi atualizada; escolha outro horário ou carrinho.";

function requestHash(input: ReservationInput): string {
  const canonical = JSON.stringify([input.cartId, input.className, input.date, input.startTime, input.endTime, input.notes]);
  return createHash("sha256").update(canonical).digest("hex");
}

function replayOrReject(existing: ReservationView, hash: string): void {
  if (existing.requestHash !== hash) {
    throw new AppError(
      422,
      "IDEMPOTENCY_KEY_REUSED",
      "Esta solicitação já foi usada com dados diferentes. Recarregue a página e tente novamente.",
    );
  }
}

export async function createReservation(
  container: AppContainer,
  user: AuthUser,
  input: ReservationInput,
  idempotencyKey: string,
): Promise<CreateReservationResult> {
  const { db, clock } = container;
  const now = schoolNow(clock.now());
  const hash = requestHash(input);

  const previous = await findReservationByIdempotencyKey(db, user.id, idempotencyKey);
  if (previous) {
    replayOrReject(previous, hash);
    return { reservation: toReservationDto(previous, user, now), replayed: true };
  }

  assertDateAndTimeRules(input, now);

  const insertWithinTransaction = () =>
    db.transaction(async (tx) => {
      const hours = await getSchoolHours(tx, { lockForShare: true });
      assertWithinSchoolHours(input, hours);

      const cart = await findCartForReservation(tx, input.cartId);
      if (!cart || !cart.active) {
        throw ruleViolation("CART_UNAVAILABLE", "O carrinho selecionado não está disponível para reservas.");
      }

      const block = await findBlockingEntry(tx, input.cartId, input.date);
      if (block) {
        throw ruleViolation(
          "DATE_BLOCKED",
          `Esta data não está disponível para reservas (${CALENDAR_BLOCK_KIND_LABELS[block.kind]}: ${block.reason}).`,
        );
      }

      return insertReservationIfNew(tx, {
        cartId: input.cartId,
        userId: user.id,
        className: input.className,
        reservationDate: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        notes: input.notes,
        idempotencyKey,
        requestHash: hash,
      });
    });

  let insertedId: string | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      insertedId = await insertWithinTransaction();
      break;
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
      if (isPgError(error, PG_EXCLUSION_VIOLATION, "reservations_no_overlap")) {
        const sameRequest = await findReservationByIdempotencyKey(db, user.id, idempotencyKey);
        if (sameRequest) {
          replayOrReject(sameRequest, hash);
          return { reservation: toReservationDto(sameRequest, user, now), replayed: true };
        }
        throw AppError.conflict(RESERVATION_CONFLICT_MESSAGE, "RESERVATION_CONFLICT");
      }
      throw error;
    }
  }

  if (!insertedId) {
    const concurrent = await findReservationByIdempotencyKey(db, user.id, idempotencyKey);
    if (!concurrent) throw new Error("Idempotent insert skipped without an existing reservation");
    replayOrReject(concurrent, hash);
    return { reservation: toReservationDto(concurrent, user, now), replayed: true };
  }

  const created = await findReservationView(db, insertedId);
  return { reservation: toReservationDto(created!, user, now), replayed: false };
}

export async function getReservation(container: AppContainer, user: AuthUser, id: string): Promise<ReservationDto> {
  const view = await findReservationView(container.db, id);
  if (!view) throw AppError.notFound("Reserva não encontrada.");
  return toReservationDto(view, user, schoolNow(container.clock.now()));
}

export async function cancelReservation(
  container: AppContainer,
  user: AuthUser,
  id: string,
  reason: string | null,
): Promise<ReservationDto> {
  const { db, clock } = container;
  const instant = clock.now();
  const now = schoolNow(instant);

  const view = await findReservationView(db, id);
  if (!view) throw AppError.notFound("Reserva não encontrada.");

  if (view.status === "CANCELLED") return toReservationDto(view, user, now);

  if (user.role !== "ADMIN") {
    if (view.userId !== user.id) {
      throw AppError.forbidden("Você só pode cancelar as suas próprias reservas.");
    }
    if (!startsInFuture(view.reservationDate, view.startTime, now)) {
      throw ruleViolation("RESERVATION_STARTED", "Não é possível cancelar uma reserva que já começou ou terminou.");
    }
  }

  await markReservationCancelled(db, id, { cancelledBy: user.id, cancelReason: reason, cancelledAt: instant });
  const updated = await findReservationView(db, id);
  return toReservationDto(updated!, user, now);
}
