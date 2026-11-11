import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { DbExecutor } from "@/lib/db/client";
import { notificationOutbox, type NotificationRow, type ReservationCreatedPayload } from "@/lib/db/schema";

export async function enqueueReservationCreated(
  db: DbExecutor,
  reservationId: string,
  recipients: string[],
  payload: ReservationCreatedPayload,
): Promise<void> {
  if (recipients.length === 0) return;
  await db.insert(notificationOutbox).values(
    recipients.map((recipient) => ({ type: "RESERVATION_CREATED" as const, reservationId, recipient, payload })),
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

export async function markNotificationSent(db: DbExecutor, id: string, sentAt: Date): Promise<void> {
  await db
    .update(notificationOutbox)
    .set({ status: "SENT", sentAt, lastError: null })
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
