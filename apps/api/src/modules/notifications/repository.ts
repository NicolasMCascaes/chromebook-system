import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { DbExecutor } from "@/lib/db/client";
import { notificationOutbox, reservations, type NotificationRow, type ReservationNotificationPayload } from "@/lib/db/schema";

export async function enqueueReservationNotification(
  db: DbExecutor,
  reservationId: string,
  recipients: string[],
  payload: ReservationNotificationPayload,
): Promise<void> {
  if (recipients.length === 0) return;
  await db.insert(notificationOutbox).values(
    recipients.map((recipient) => ({ type: "RESERVATION_REQUESTED" as const, reservationId, recipient, payload })),
  );
}

export async function claimDueNotifications(
  db: DbExecutor,
  options: { now: Date; leaseUntil: Date; limit: number },
): Promise<NotificationRow[]> {
  const due = db
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(and(eq(notificationOutbox.status, "PENDING"), lte(notificationOutbox.nextAttemptAt, options.now)))
    .orderBy(asc(notificationOutbox.nextAttemptAt))
    .limit(options.limit)
    .for("update", { skipLocked: true });
  return db
    .update(notificationOutbox)
    .set({ attempts: sql`${notificationOutbox.attempts} + 1`, nextAttemptAt: options.leaseUntil })
    .where(inArray(notificationOutbox.id, due))
    .returning();
}

const payloadWithoutApprovalTokens = sql`case
  when jsonb_typeof(${notificationOutbox.payload} -> 'slots') = 'array' then
    (${notificationOutbox.payload} - 'approvalToken') || jsonb_build_object(
      'slots',
      (select coalesce(jsonb_agg(slot - 'approvalToken' order by slot_position), '[]'::jsonb)
        from jsonb_array_elements(${notificationOutbox.payload} -> 'slots') with ordinality as slots(slot, slot_position))
    )
  else ${notificationOutbox.payload} - 'approvalToken'
end`;

const notificationReservationIds = sql`coalesce(
  (select array_agg((slot ->> 'reservationId')::uuid)
    from jsonb_array_elements(case when jsonb_typeof(${notificationOutbox.payload} -> 'slots') = 'array' then ${notificationOutbox.payload} -> 'slots' else '[]'::jsonb end) as slots(slot)),
  array[${notificationOutbox.reservationId}]
)`;

const hasPendingReservation = sql<boolean>`exists (
  select 1 from app.reservations as pending
  where pending.status = 'PENDING' and pending.id = any(${notificationReservationIds})
)`;

function hasSlotFrom(fromDate: string) {
  return sql<boolean>`exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(${notificationOutbox.payload} -> 'slots') = 'array' then ${notificationOutbox.payload} -> 'slots' else '[]'::jsonb end) as slots(slot)
    where slot ->> 'date' >= ${fromDate}
  )`;
}

export async function markNotificationSent(db: DbExecutor, id: string, sentAt: Date): Promise<void> {
  await db
    .update(notificationOutbox)
    .set({ status: "SENT", sentAt, lastError: null, payload: payloadWithoutApprovalTokens })
    .where(eq(notificationOutbox.id, id));
}

export async function markNotificationFailed(
  db: DbExecutor,
  notification: NotificationRow,
  error: { message: string; retryAt: Date },
): Promise<void> {
  const exhausted = notification.attempts >= notification.maxAttempts;
  await db
    .update(notificationOutbox)
    .set({
      status: exhausted ? "FAILED" : "PENDING",
      lastError: error.message,
      nextAttemptAt: error.retryAt,
    })
    .where(eq(notificationOutbox.id, notification.id));
}

export async function listFailedNotifications(db: DbExecutor, options: { fromDate: string }) {
  return db
    .select({
      id: notificationOutbox.id,
      recipient: notificationOutbox.recipient,
      attempts: notificationOutbox.attempts,
      lastError: notificationOutbox.lastError,
      updatedAt: notificationOutbox.updatedAt,
      payload: notificationOutbox.payload,
      reservationId: reservations.id,
      reservationStatus: reservations.status,
      retryable: hasPendingReservation,
    })
    .from(notificationOutbox)
    .innerJoin(reservations, eq(reservations.id, notificationOutbox.reservationId))
    .where(
      and(
        eq(notificationOutbox.status, "FAILED"),
        or(gte(reservations.reservationDate, options.fromDate), hasSlotFrom(options.fromDate)),
      ),
    )
    .orderBy(desc(notificationOutbox.updatedAt));
}

export async function requeueFailedNotification(db: DbExecutor, id: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(notificationOutbox)
    .set({ status: "PENDING", attempts: 0, nextAttemptAt: now })
    .where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.status, "FAILED"), hasPendingReservation))
    .returning({ id: notificationOutbox.id });
  return rows.length > 0;
}
