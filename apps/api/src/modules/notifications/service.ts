import type { AppContainer } from "@/lib/container";
import type { NotificationRow } from "@/lib/db/schema";
import type { EmailMessage } from "@/lib/email/sender";
import { claimDueNotifications, markNotificationFailed, markNotificationSent } from "./repository";

const BATCH_SIZE = 20;
const LEASE_MINUTES = 5;
const MAX_ERROR_LENGTH = 300;

export interface DispatchResult {
  sent: number;
  failed: number;
}

function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

function retryDelayMinutes(attempts: number): number {
  return 2 ** attempts;
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falha desconhecida no envio";
  return message.replace(/\s+/g, " ").slice(0, MAX_ERROR_LENGTH);
}

export function approvalLink(appPublicUrl: string, reservationId: string, approvalToken: string): string {
  const url = new URL("/aprovacao", appPublicUrl);
  url.searchParams.set("reserva", reservationId);
  url.searchParams.set("codigo", approvalToken);
  return url.toString();
}

export function buildReservationEmail(notification: NotificationRow, appPublicUrl?: string): EmailMessage {
  const payload = notification.payload;
  const isRequest = notification.type === "RESERVATION_REQUESTED";
  const lines = [
    isRequest ? "Um professor pediu um carrinho de Chromebooks. O pedido aguarda a sua aprovação." : "Uma nova reserva de carrinho foi confirmada.",
    "",
    `Professor: ${payload.teacherName}`,
    `Turma: ${payload.className}`,
    `Carrinho: ${payload.cartName}`,
    `Data: ${formatDate(payload.date)}`,
    `Horário: ${payload.startTime} às ${payload.endTime}`,
  ];
  if (payload.notes) lines.push(`Observação: ${payload.notes}`);
  if (isRequest && appPublicUrl && payload.approvalToken) {
    lines.push("", "Para aprovar ou recusar, abra:", approvalLink(appPublicUrl, notification.reservationId, payload.approvalToken));
  } else if (isRequest) {
    lines.push("", "Para aprovar ou recusar, acesse a área do TI em Reservas.");
  } else if (appPublicUrl) {
    lines.push("", `Agenda: ${appPublicUrl}`);
  }
  const when = `${payload.cartName} em ${formatDate(payload.date)} (${payload.startTime}–${payload.endTime})`;
  return {
    to: notification.recipient,
    subject: isRequest ? `Pedido de reserva: ${when}` : `Nova reserva: ${when}`,
    text: lines.join("\n"),
  };
}

export async function dispatchPendingNotifications(container: AppContainer): Promise<DispatchResult> {
  const { db, clock, emailSender } = container;
  const now = clock.now();
  const claimed = await db.transaction((tx) =>
    claimDueNotifications(tx, { now, leaseUntil: addMinutes(now, LEASE_MINUTES), limit: BATCH_SIZE }),
  );

  const result: DispatchResult = { sent: 0, failed: 0 };
  for (const notification of claimed) {
    try {
      await emailSender.send(buildReservationEmail(notification, container.appPublicUrl));
      await markNotificationSent(db, notification.id, clock.now());
      result.sent++;
    } catch (error) {
      await markNotificationFailed(db, notification, {
        message: sanitizeError(error),
        retryAt: addMinutes(clock.now(), retryDelayMinutes(notification.attempts)),
      });
      result.failed++;
    }
  }
  return result;
}

export function scheduleNotificationDispatch(container: AppContainer): void {
  container.runAfterResponse(async () => {
    try {
      await dispatchPendingNotifications(container);
    } catch (error) {
      console.error("Falha ao processar notificações pendentes", sanitizeError(error));
    }
  });
}
