import { randomUUID } from "node:crypto";
import * as reservationsRoute from "@/app/api/reservations/route";
import * as cancelRoute from "@/app/api/reservations/[id]/cancel/route";
import { carts } from "@/lib/db/schema";
import type { TestContext, TestUser } from "./context";
import { apiRequest, params } from "./http";

export const NEXT_TUESDAY = "2030-03-05";
export const TODAY = "2030-03-04";
export const SATURDAY = "2030-03-09";
export const SUNDAY = "2030-03-10";
export const LAST_FRIDAY = "2030-03-01";

export async function seedCarts(ctx: TestContext) {
  const rows = await ctx.db
    .insert(carts)
    .values([
      { name: "Carrinho 1", color: "#1E88E5", displayOrder: 1 },
      { name: "Carrinho 2", color: "#43A047", displayOrder: 2 },
    ])
    .returning();
  return { cart1: rows[0]!.id, cart2: rows[1]!.id };
}

export interface ReservationBody {
  cartId: string;
  className?: string;
  date?: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
  [key: string]: unknown;
}

export function postReservation(user: TestUser, body: ReservationBody, idempotencyKey: string | null = randomUUID()) {
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  return reservationsRoute.POST(
    apiRequest("/api/reservations", {
      method: "POST",
      token: user.token,
      headers,
      body: { className: "7º A", date: NEXT_TUESDAY, ...body },
    }),
    params(),
  );
}

export function cancelReservationRequest(user: TestUser, id: string, reason?: string) {
  return cancelRoute.POST(
    apiRequest(`/api/reservations/${id}/cancel`, { method: "POST", token: user.token, body: reason ? { reason } : {} }),
    params({ id }),
  );
}
