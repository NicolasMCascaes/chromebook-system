import { and, asc, eq, gte, ilike, inArray, lte, or, type SQL } from "drizzle-orm";
import { ACTIVE_RESERVATION_STATUSES, type ReservationStatus } from "@chromebook/shared";
import type { DbExecutor } from "@/lib/db/client";
import { carts, reservations, type ReservationRow } from "@/lib/db/schema";

const isActive = inArray(reservations.status, [...ACTIVE_RESERVATION_STATUSES]);

export type ReservationView = ReservationRow & { cartName: string; cartColor: string };

function selectReservationViews(db: DbExecutor) {
  return db
    .select({
      id: reservations.id,
      cartId: reservations.cartId,
      userId: reservations.userId,
      teacherName: reservations.teacherName,
      className: reservations.className,
      reservationDate: reservations.reservationDate,
      startTime: reservations.startTime,
      endTime: reservations.endTime,
      status: reservations.status,
      notes: reservations.notes,
      idempotencyKey: reservations.idempotencyKey,
      requestHash: reservations.requestHash,
      cancelTokenHash: reservations.cancelTokenHash,
      cancelledAt: reservations.cancelledAt,
      cancelledBy: reservations.cancelledBy,
      cancelReason: reservations.cancelReason,
      decidedAt: reservations.decidedAt,
      decidedBy: reservations.decidedBy,
      decisionReason: reservations.decisionReason,
      approvalTokenHash: reservations.approvalTokenHash,
      createdAt: reservations.createdAt,
      updatedAt: reservations.updatedAt,
      cartName: carts.name,
      cartColor: carts.color,
    })
    .from(reservations)
    .innerJoin(carts, eq(carts.id, reservations.cartId))
    .$dynamic();
}

export async function findReservationView(db: DbExecutor, id: string): Promise<ReservationView | undefined> {
  const [row] = await selectReservationViews(db).where(eq(reservations.id, id));
  return row;
}

export async function findReservationByIdempotencyKey(
  db: DbExecutor,
  idempotencyKey: string,
): Promise<ReservationView | undefined> {
  const [row] = await selectReservationViews(db).where(eq(reservations.idempotencyKey, idempotencyKey));
  return row;
}

export async function listActiveReservations(
  db: DbExecutor,
  range: { from: string; to: string; cartId?: string },
): Promise<ReservationView[]> {
  const conditions: SQL[] = [
    isActive,
    gte(reservations.reservationDate, range.from),
    lte(reservations.reservationDate, range.to),
  ];
  if (range.cartId) conditions.push(eq(reservations.cartId, range.cartId));
  return selectReservationViews(db)
    .where(and(...conditions))
    .orderBy(asc(reservations.reservationDate), asc(reservations.startTime), asc(carts.displayOrder));
}

export async function insertReservationIfNew(
  db: DbExecutor,
  values: typeof reservations.$inferInsert,
): Promise<string | undefined> {
  const [row] = await db
    .insert(reservations)
    .values(values)
    .onConflictDoNothing({ target: reservations.idempotencyKey })
    .returning({ id: reservations.id });
  return row?.id;
}

export async function markReservationCancelled(
  db: DbExecutor,
  id: string,
  cancellation: { cancelledBy: string | null; cancelReason: string | null; cancelledAt: Date },
): Promise<boolean> {
  const rows = await db
    .update(reservations)
    .set({ status: "CANCELLED", ...cancellation })
    .where(and(eq(reservations.id, id), isActive))
    .returning({ id: reservations.id });
  return rows.length > 0;
}

const ADMIN_LIST_LIMIT = 500;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function listReservationsForAdmin(
  db: DbExecutor,
  filter: { from: string; to: string; cartId?: string; status?: ReservationStatus; search?: string },
): Promise<ReservationView[]> {
  const conditions: SQL[] = [gte(reservations.reservationDate, filter.from), lte(reservations.reservationDate, filter.to)];
  if (filter.cartId) conditions.push(eq(reservations.cartId, filter.cartId));
  if (filter.status) conditions.push(eq(reservations.status, filter.status));
  if (filter.search) {
    const pattern = `%${escapeLike(filter.search)}%`;
    conditions.push(or(ilike(reservations.teacherName, pattern), ilike(reservations.className, pattern))!);
  }
  return selectReservationViews(db)
    .where(and(...conditions))
    .orderBy(asc(reservations.reservationDate), asc(reservations.startTime), asc(carts.displayOrder))
    .limit(ADMIN_LIST_LIMIT);
}

export async function listUpcomingActiveReservations(
  db: DbExecutor,
  filter: { from: string; to?: string; cartId?: string | null },
): Promise<ReservationView[]> {
  const conditions: SQL[] = [isActive, gte(reservations.reservationDate, filter.from)];
  if (filter.to) conditions.push(lte(reservations.reservationDate, filter.to));
  if (filter.cartId) conditions.push(eq(reservations.cartId, filter.cartId));
  return selectReservationViews(db)
    .where(and(...conditions))
    .orderBy(asc(reservations.reservationDate), asc(reservations.startTime), asc(carts.displayOrder));
}

export async function updateReservationFields(
  db: DbExecutor,
  id: string,
  values: Partial<Pick<typeof reservations.$inferInsert, "cartId" | "teacherName" | "className" | "reservationDate" | "startTime" | "endTime" | "notes">>,
): Promise<boolean> {
  const rows = await db
    .update(reservations)
    .set(values)
    .where(and(eq(reservations.id, id), isActive))
    .returning({ id: reservations.id });
  return rows.length > 0;
}

export async function markReservationDecision(
  db: DbExecutor,
  id: string,
  decision: { status: "CONFIRMED" | "REJECTED"; decidedBy: string | null; decidedAt: Date; decisionReason: string | null },
): Promise<boolean> {
  const rows = await db
    .update(reservations)
    .set(decision)
    .where(and(eq(reservations.id, id), eq(reservations.status, "PENDING")))
    .returning({ id: reservations.id });
  return rows.length > 0;
}
