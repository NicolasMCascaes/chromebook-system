import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import {
  CALENDAR_BLOCK_KIND_LABELS,
  checkClassPeriods,
  checkReservationSlot,
  checkSchoolHours,
  findOverlappingSlots,
  isActiveReservationStatus,
  schoolNow,
  SLOT_OVERLAP_MESSAGE,
  type ReservationDto,
  type reservationBatchInputSchema,
  type reservationInputSchema,
} from "@chromebook/shared";
import type { AppContainer } from "@/lib/container";
import type { AuthUser } from "@/lib/auth/authenticate";
import { AppError } from "@/lib/http/errors";
import { isPgError, isRetryableTransactionError, PG_EXCLUSION_VIOLATION } from "@/lib/db/errors";
import { getNotificationEmails, getSchoolHours, listClassSchedules } from "@/modules/settings/repository";
import { enqueueReservationNotification } from "@/modules/notifications/repository";
import { findBlockingEntry } from "@/modules/blocks/repository";
import { findCartForReservation } from "@/modules/carts/repository";
import {
  findReservationByIdempotencyKey,
  findReservationView,
  insertReservationIfNew,
  markReservationCancelled,
  type ReservationView,
} from "./repository";
import { assertDateAndTimeRules, assertMatchesClassPeriods, assertWithinSchoolHours, ruleViolation, startsInFuture } from "./rules";
import { toReservationDto, type ReservationAudience } from "./mapper";

export type ReservationInput = z.output<typeof reservationInputSchema>;

export interface CreateReservationResult {
  reservation: ReservationDto;
  replayed: boolean;
}

const MAX_TRANSACTION_ATTEMPTS = 3;

export const RESERVATION_CONFLICT_MESSAGE =
  "Este carrinho já foi reservado em parte desse horário. A disponibilidade foi atualizada; escolha outro horário ou carrinho.";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requestHash(input: ReservationInput): string {
  return sha256(
    JSON.stringify([
      input.teacherName,
      input.cartId,
      input.className,
      input.date,
      input.startTime,
      input.endTime,
      input.notes,
      input.cancelToken,
    ]),
  );
}

export function hashCancelToken(token: string): string {
  return sha256(`cancel:${token}`);
}

function matchesHash(storedHash: string | null, receivedHash: string): boolean {
  if (!storedHash) return false;
  const expected = Buffer.from(storedHash, "hex");
  const received = Buffer.from(receivedHash, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function matchesCancelToken(view: ReservationView, token: string | undefined): boolean {
  return Boolean(token) && matchesHash(view.cancelTokenHash, hashCancelToken(token!));
}

export function hashApprovalToken(token: string): string {
  return sha256(`approve:${token}`);
}

export function matchesApprovalToken(view: ReservationView, token: string | undefined): boolean {
  return Boolean(token) && matchesHash(view.approvalTokenHash, hashApprovalToken(token!));
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
  createdBy: AuthUser | null,
  input: ReservationInput,
  idempotencyKey: string,
): Promise<CreateReservationResult> {
  const { db, clock } = container;
  const now = schoolNow(clock.now());
  const hash = requestHash(input);

  const previous = await findReservationByIdempotencyKey(db, idempotencyKey);
  if (previous) {
    replayOrReject(previous, hash);
    return { reservation: toReservationDto(previous, "owner", now), replayed: true };
  }

  assertDateAndTimeRules(input, now);
  const approvedByCreator = createdBy?.role === "ADMIN";
  const approvalToken = approvedByCreator ? null : randomBytes(32).toString("base64url");

  const insertWithinTransaction = () =>
    db.transaction(async (tx) => {
      const hours = await getSchoolHours(tx, { lockForShare: true });
      assertWithinSchoolHours(input, hours);
      if (!approvedByCreator) assertMatchesClassPeriods(input, await listClassSchedules(tx));

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

      const insertedId = await insertReservationIfNew(tx, {
        cartId: input.cartId,
        userId: createdBy?.id ?? null,
        teacherName: input.teacherName,
        className: input.className,
        reservationDate: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        notes: input.notes,
        idempotencyKey,
        requestHash: hash,
        cancelTokenHash: hashCancelToken(input.cancelToken),
        status: approvedByCreator ? "CONFIRMED" : "PENDING",
        approvalTokenHash: approvalToken ? hashApprovalToken(approvalToken) : null,
        decidedBy: approvedByCreator ? createdBy!.id : null,
        decidedAt: approvedByCreator ? clock.now() : null,
      });
      if (insertedId && approvalToken) {
        await enqueueReservationNotification(tx, insertedId, await getNotificationEmails(tx), {
          teacherName: input.teacherName,
          className: input.className,
          cartName: cart.name,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          notes: input.notes,
          approvalToken,
        });
      }
      return insertedId;
    });

  let insertedId: string | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      insertedId = await insertWithinTransaction();
      break;
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
      if (isPgError(error, PG_EXCLUSION_VIOLATION, "reservations_no_overlap")) {
        const sameRequest = await findReservationByIdempotencyKey(db, idempotencyKey);
        if (sameRequest) {
          replayOrReject(sameRequest, hash);
          return { reservation: toReservationDto(sameRequest, "owner", now), replayed: true };
        }
        throw AppError.conflict(RESERVATION_CONFLICT_MESSAGE, "RESERVATION_CONFLICT");
      }
      throw error;
    }
  }

  if (!insertedId) {
    const concurrent = await findReservationByIdempotencyKey(db, idempotencyKey);
    if (!concurrent) throw new Error("Idempotent insert skipped without an existing reservation");
    replayOrReject(concurrent, hash);
    return { reservation: toReservationDto(concurrent, "owner", now), replayed: true };
  }

  const created = await findReservationView(db, insertedId);
  return { reservation: toReservationDto(created!, "owner", now), replayed: false };
}

export type ReservationBatchInput = z.output<typeof reservationBatchInputSchema>;

export interface CreateReservationBatchResult {
  reservations: ReservationDto[];
  replayed: boolean;
}

class SlotConflictError extends Error {
  constructor(readonly index: number) {
    super("Reservation slot conflict");
  }
}

class ConcurrentBatchError extends Error {}

function slotLabel(index: number): string {
  return `Horário ${index + 1}`;
}

function slotViolation(index: number, violation: { code: string; message: string; field: string }): AppError {
  return new AppError(422, violation.code, `${slotLabel(index)}: ${violation.message}`, [
    { path: `slots.${index}.${violation.field}`, message: violation.message },
  ]);
}

export function slotIdempotencyKey(batchKey: string, index: number): string {
  const hex = sha256(`batch:${batchKey}:${index}`);
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function batchSlotHashes(input: ReservationBatchInput): string[] {
  const batchHash = sha256(
    JSON.stringify([
      input.teacherName,
      input.slots.map((slot) => [slot.cartId, slot.className, slot.date, slot.startTime, slot.endTime, slot.notes, slot.cancelToken]),
    ]),
  );
  return input.slots.map((_, index) => sha256(`${batchHash}:${index}`));
}

function idempotencyKeyReused(): AppError {
  return new AppError(
    422,
    "IDEMPOTENCY_KEY_REUSED",
    "Esta solicitação já foi usada com dados diferentes. Recarregue a página e tente novamente.",
  );
}

async function findBatchReplay(
  db: AppContainer["db"],
  idempotencyKey: string,
  hashes: string[],
  now: ReturnType<typeof schoolNow>,
): Promise<ReservationDto[] | null> {
  const views: ReservationView[] = [];
  for (let index = 0; index < hashes.length; index++) {
    const view = await findReservationByIdempotencyKey(db, slotIdempotencyKey(idempotencyKey, index));
    if (!view) {
      if (index === 0) return null;
      throw idempotencyKeyReused();
    }
    replayOrReject(view, hashes[index]!);
    views.push(view);
  }
  return views.map((view) => toReservationDto(view, "owner", now));
}

export async function createReservationBatch(
  container: AppContainer,
  createdBy: AuthUser | null,
  input: ReservationBatchInput,
  idempotencyKey: string,
): Promise<CreateReservationBatchResult> {
  const { db, clock } = container;
  const now = schoolNow(clock.now());
  const hashes = batchSlotHashes(input);

  const previous = await findBatchReplay(db, idempotencyKey, hashes, now);
  if (previous) return { reservations: previous, replayed: true };

  input.slots.forEach((slot, index) => {
    const violation = checkReservationSlot(slot, now);
    if (violation) throw slotViolation(index, violation);
  });
  const overlapping = findOverlappingSlots(input.slots);
  if (overlapping.length > 0) {
    throw slotViolation(overlapping[0]!, { code: "SLOT_OVERLAP", message: SLOT_OVERLAP_MESSAGE, field: "cartId" });
  }

  const approvedByCreator = createdBy?.role === "ADMIN";
  const approvalTokens = input.slots.map(() => (approvedByCreator ? null : randomBytes(32).toString("base64url")));

  const insertWithinTransaction = () =>
    db.transaction(async (tx) => {
      const hours = await getSchoolHours(tx, { lockForShare: true });
      const schedules = approvedByCreator ? [] : await listClassSchedules(tx);
      const recipients = approvedByCreator ? [] : await getNotificationEmails(tx);
      const insertedIds: string[] = [];

      for (const [index, slot] of input.slots.entries()) {
        const hoursViolation = checkSchoolHours(slot, hours);
        if (hoursViolation) throw slotViolation(index, hoursViolation);
        if (!approvedByCreator) {
          const periodViolation = checkClassPeriods(slot, schedules);
          if (periodViolation) throw slotViolation(index, periodViolation);
        }

        const cart = await findCartForReservation(tx, slot.cartId);
        if (!cart || !cart.active) {
          throw slotViolation(index, {
            code: "CART_UNAVAILABLE",
            message: "O carrinho selecionado não está disponível para reservas.",
            field: "cartId",
          });
        }

        const block = await findBlockingEntry(tx, slot.cartId, slot.date);
        if (block) {
          throw slotViolation(index, {
            code: "DATE_BLOCKED",
            message: `Esta data não está disponível para reservas (${CALENDAR_BLOCK_KIND_LABELS[block.kind]}: ${block.reason}).`,
            field: "date",
          });
        }

        const approvalToken = approvalTokens[index]!;
        let insertedId: string | undefined;
        try {
          insertedId = await insertReservationIfNew(tx, {
            cartId: slot.cartId,
            userId: createdBy?.id ?? null,
            teacherName: input.teacherName,
            className: slot.className,
            reservationDate: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            notes: slot.notes,
            idempotencyKey: slotIdempotencyKey(idempotencyKey, index),
            requestHash: hashes[index]!,
            cancelTokenHash: hashCancelToken(slot.cancelToken),
            status: approvedByCreator ? "CONFIRMED" : "PENDING",
            approvalTokenHash: approvalToken ? hashApprovalToken(approvalToken) : null,
            decidedBy: approvedByCreator ? createdBy!.id : null,
            decidedAt: approvedByCreator ? clock.now() : null,
          });
        } catch (error) {
          if (isPgError(error, PG_EXCLUSION_VIOLATION, "reservations_no_overlap")) throw new SlotConflictError(index);
          throw error;
        }
        if (!insertedId) throw new ConcurrentBatchError();
        insertedIds.push(insertedId);

        if (approvalToken) {
          await enqueueReservationNotification(tx, insertedId, recipients, {
            teacherName: input.teacherName,
            className: slot.className,
            cartName: cart.name,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            notes: slot.notes,
            approvalToken,
          });
        }
      }
      return insertedIds;
    });

  let insertedIds: string[];
  for (let attempt = 1; ; attempt++) {
    try {
      insertedIds = await insertWithinTransaction();
      break;
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
      if (error instanceof SlotConflictError || error instanceof ConcurrentBatchError) {
        const concurrent = await findBatchReplay(db, idempotencyKey, hashes, now);
        if (concurrent) return { reservations: concurrent, replayed: true };
        if (error instanceof ConcurrentBatchError) throw new Error("Idempotent batch insert skipped without existing reservations");
        throw new AppError(
          409,
          "RESERVATION_CONFLICT",
          `${slotLabel(error.index)}: ${RESERVATION_CONFLICT_MESSAGE} Nenhum horário do pedido foi reservado.`,
          [{ path: `slots.${error.index}.cartId`, message: RESERVATION_CONFLICT_MESSAGE }],
        );
      }
      throw error;
    }
  }

  const created: ReservationDto[] = [];
  for (const id of insertedIds) {
    const view = await findReservationView(db, id);
    created.push(toReservationDto(view!, "owner", now));
  }
  return { reservations: created, replayed: false };
}

export async function getReservation(
  container: AppContainer,
  admin: AuthUser | null,
  id: string,
  cancelToken: string | undefined,
): Promise<ReservationDto> {
  const view = await findReservationView(container.db, id);
  if (!view) throw AppError.notFound("Reserva não encontrada.");
  const audience: ReservationAudience = admin ? "admin" : matchesCancelToken(view, cancelToken) ? "owner" : "public";
  return toReservationDto(view, audience, schoolNow(container.clock.now()));
}

export async function cancelReservation(
  container: AppContainer,
  admin: AuthUser | null,
  id: string,
  input: { reason: string | null; cancelToken?: string },
): Promise<ReservationDto> {
  const { db, clock } = container;
  const instant = clock.now();
  const now = schoolNow(instant);

  const view = await findReservationView(db, id);
  if (!view) throw AppError.notFound("Reserva não encontrada.");

  const audience: ReservationAudience = admin ? "admin" : "owner";
  if (!admin && !matchesCancelToken(view, input.cancelToken)) {
    throw AppError.forbidden(
      "Não foi possível confirmar que você criou esta reserva. Peça o cancelamento ao TI.",
    );
  }

  if (!isActiveReservationStatus(view.status)) return toReservationDto(view, audience, now);

  if (!admin && !startsInFuture(view.reservationDate, view.startTime, now)) {
    throw ruleViolation("RESERVATION_STARTED", "Não é possível cancelar uma reserva que já começou ou terminou.");
  }

  await markReservationCancelled(db, id, {
    cancelledBy: admin?.id ?? null,
    cancelReason: input.reason,
    cancelledAt: instant,
  });
  const updated = await findReservationView(db, id);
  return toReservationDto(updated!, audience, now);
}
