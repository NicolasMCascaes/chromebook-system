import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { DbExecutor } from "@/lib/db/client";
import { carts, reservations, type ReservationRow } from "@/lib/db/schema";

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

export async function listConfirmedReservations(
  db: DbExecutor,
  range: { from: string; to: string; cartId?: string },
): Promise<ReservationView[]> {
  const conditions: SQL[] = [
    eq(reservations.status, "CONFIRMED"),
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
    .where(and(eq(reservations.id, id), eq(reservations.status, "CONFIRMED")))
    .returning({ id: reservations.id });
  return rows.length > 0;
}
