import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AdminReservationDto, ReservationDto } from "@chromebook/shared";
import * as upcomingRoute from "@/app/api/admin/carts/[id]/upcoming-reservations/route";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import { cancelReservationRequest, createTeacher, NEXT_TUESDAY, postReservation, seedCarts, TODAY } from "./helpers/reservations";

describe("reservas futuras de um carrinho", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let cart1: string;
  let cart2: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    admin = await ctx.createUser("ADMIN");
    ({ cart1, cart2 } = await seedCarts(ctx));
  });

  afterAll(() => ctx.close());

  const upcoming = (id: string, token = admin.token) =>
    upcomingRoute.GET(apiRequest(`/api/admin/carts/${id}/upcoming-reservations`, { token }), params({ id }));

  const reserve = async (cartId: string, date: string, startTime: string, endTime: string) => {
    const teacher = createTeacher("Ana");
    const response = await postReservation(teacher, { cartId, date, startTime, endTime });
    expect(response.status).toBe(201);
    return { teacher, reservation: (await response.json()) as ReservationDto };
  };

  it("lista pedidos e reservas futuras ativas só do carrinho informado", async () => {
    const future = await reserve(cart1, NEXT_TUESDAY, "08:00", "09:00");
    const earlierToday = await reserve(cart1, TODAY, "10:30", "11:00");
    const cancelled = await reserve(cart1, NEXT_TUESDAY, "10:00", "11:00");
    await cancelReservationRequest(cancelled.teacher, cancelled.reservation.id);
    await reserve(cart2, NEXT_TUESDAY, "08:00", "09:00");
    ctx.clock.set("2030-03-04T13:45:00Z");

    const response = await upcoming(cart1);
    expect(response.status).toBe(200);
    const body = (await response.json()) as AdminReservationDto[];
    expect(body.map((item) => item.id)).toEqual([future.reservation.id]);
    expect(body.map((item) => item.id)).not.toContain(earlierToday.reservation.id);
  });

  it("exige administrador e carrinho existente", async () => {
    const professor = await ctx.createUser("PROFESSOR");
    expect((await upcoming(cart1, professor.token)).status).toBe(403);
    expect((await upcoming("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
