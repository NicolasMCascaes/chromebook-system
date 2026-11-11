import type { z } from "zod";
import {
  CALENDAR_BLOCK_KIND_LABELS,
  RESERVATION_STATUS_LABELS,
  schoolNow,
  type AdminReservationDto,
  type reservationDecisionSchema,
} from "@chromebook/shared";
import type { AppContainer } from "@/lib/container";
import type { AuthUser } from "@/lib/auth/authenticate";
import { AppError } from "@/lib/http/errors";
import { findBlockingEntry } from "@/modules/blocks/repository";
import { findCartForReservation } from "@/modules/carts/repository";
import { findReservationView, markReservationDecision, type ReservationView } from "./repository";
import { toAdminReservationDto } from "./mapper";
import { ruleViolation } from "./rules";
import { matchesApprovalToken } from "./service";

export type ReservationDecisionInput = z.output<typeof reservationDecisionSchema>;

const INVALID_LINK_MESSAGE = "Este link de aprovação não é válido. Abra o pedido pela área do TI, em Reservas.";

async function findAuthorizedReservation(
  container: AppContainer,
  admin: AuthUser | null,
  id: string,
  approvalToken: string | undefined,
): Promise<ReservationView> {
  const view = await findReservationView(container.db, id);
  if (!view) throw AppError.notFound("Reserva não encontrada.");
  if (!admin && !matchesApprovalToken(view, approvalToken)) throw AppError.forbidden(INVALID_LINK_MESSAGE);
  return view;
}

export async function getReservationForApproval(
  container: AppContainer,
  id: string,
  approvalToken: string | undefined,
): Promise<AdminReservationDto> {
  const view = await findAuthorizedReservation(container, null, id, approvalToken);
  return toAdminReservationDto(view, schoolNow(container.clock.now()));
}

async function assertStillBookable(container: AppContainer, view: ReservationView): Promise<void> {
  const cart = await findCartForReservation(container.db, view.cartId);
  if (!cart?.active) {
    throw ruleViolation(
      "CART_UNAVAILABLE",
      "O carrinho deste pedido foi desativado depois do pedido. Recuse o pedido ou remarque para outro carrinho.",
    );
  }
  const block = await findBlockingEntry(container.db, view.cartId, view.reservationDate);
  if (block) {
    throw ruleViolation(
      "DATE_BLOCKED",
      `A data ficou indisponível depois do pedido (${CALENDAR_BLOCK_KIND_LABELS[block.kind]}: ${block.reason}). Recuse o pedido ou remarque a reserva.`,
    );
  }
}

export async function decideReservation(
  container: AppContainer,
  admin: AuthUser | null,
  id: string,
  input: ReservationDecisionInput,
): Promise<AdminReservationDto> {
  const view = await findAuthorizedReservation(container, admin, id, input.approvalToken);
  if (view.status !== "PENDING") {
    throw ruleViolation(
      "RESERVATION_ALREADY_DECIDED",
      `Este pedido não está mais aguardando aprovação (situação atual: ${RESERVATION_STATUS_LABELS[view.status].toLowerCase()}).`,
    );
  }
  if (input.decision === "APPROVE") await assertStillBookable(container, view);

  const decided = await markReservationDecision(container.db, id, {
    status: input.decision === "APPROVE" ? "CONFIRMED" : "REJECTED",
    decidedBy: admin?.id ?? null,
    decidedAt: container.clock.now(),
    decisionReason: input.reason,
  });
  if (!decided) {
    throw AppError.conflict("Este pedido acabou de ser decidido ou cancelado. Atualize a página.", "RESERVATION_ALREADY_DECIDED");
  }
  const updated = await findReservationView(container.db, id);
  return toAdminReservationDto(updated!, schoolNow(container.clock.now()));
}
