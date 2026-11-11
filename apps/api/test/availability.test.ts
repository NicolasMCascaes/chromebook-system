import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AvailabilityDto, CalendarDto, ReservationDto } from "@chromebook/shared";
import * as availabilityRoute from "@/app/api/availability/route";
import * as calendarRoute from "@/app/api/calendar/route";
import { calendarBlocks, chromebooks } from "@/lib/db/schema";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import { cancelReservationRequest, NEXT_TUESDAY, postReservation, SATURDAY, seedCarts, TODAY } from "./helpers/reservations";

describe("disponibilidade e agenda", () => {
  let ctx: TestContext;
  let professor: TestUser;
  let cart1: string;
  let cart2: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    professor = await ctx.createUser("PROFESSOR", { name: "Ana Souza" });
    ({ cart1, cart2 } = await seedCarts(ctx));
  });

  afterAll(() => ctx.close());

  const availability = async (query: string) => {
    const response = await availabilityRoute.GET(apiRequest(`/api/availability?${query}`, { token: professor.token }), params());
    return { status: response.status, body: (await response.json()) as AvailabilityDto };
  };

  const calendar = async (query: string) => {
    const response = await calendarRoute.GET(apiRequest(`/api/calendar?${query}`, { token: professor.token }), params());
    return { status: response.status, body: (await response.json()) as CalendarDto };
  };

  it("calcula intervalos livres por carrinho a partir das reservas confirmadas", async () => {
    await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
    await postReservation(professor, { cartId: cart1, startTime: "13:00", endTime: "14:30" });

    const { status, body } = await availability(`date=${NEXT_TUESDAY}`);

    expect(status).toBe(200);
    expect(body.bookable).toBe(true);
    const first = body.carts.find((cart) => cart.cartId === cart1)!;
    expect(first.busy.map(({ start, end, teacherName }) => ({ start, end, teacherName }))).toEqual([
      { start: "08:00", end: "09:00", teacherName: "Ana Souza" },
      { start: "13:00", end: "14:30", teacherName: "Ana Souza" },
    ]);
    expect(first.free).toEqual([
      { start: "07:00", end: "08:00" },
      { start: "09:00", end: "13:00" },
      { start: "14:30", end: "18:00" },
    ]);
    expect(body.carts.find((cart) => cart.cartId === cart2)!.free).toEqual([{ start: "07:00", end: "18:00" }]);
  });

  it("reserva cancelada volta a aparecer como horário livre", async () => {
    const created = (await (await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).json()) as ReservationDto;
    await cancelReservationRequest(professor, created.id);

    const { body } = await availability(`date=${NEXT_TUESDAY}&cartId=${cart1}`);

    expect(body.carts).toHaveLength(1);
    expect(body.carts[0]!.busy).toEqual([]);
    expect(body.carts[0]!.free).toEqual([{ start: "07:00", end: "18:00" }]);
  });

  it("no dia atual oferece apenas horários a partir de agora", async () => {
    ctx.clock.set("2030-03-04T13:07:00Z");

    const { body } = await availability(`date=${TODAY}&cartId=${cart1}`);

    expect(body.carts[0]!.free).toEqual([{ start: "10:10", end: "18:00" }]);
  });

  it("informa dia não reservável em fins de semana e bloqueios", async () => {
    const weekend = await availability(`date=${SATURDAY}`);
    expect(weekend.body).toMatchObject({ bookable: false, reason: "Não há reservas aos sábados e domingos." });
    expect(weekend.body.carts.every((cart) => cart.free.length === 0)).toBe(true);

    await ctx.db.insert(calendarBlocks).values({
      kind: "BLOCK",
      startDate: NEXT_TUESDAY,
      endDate: NEXT_TUESDAY,
      reason: "Carrinho em revisão",
      cartId: cart1,
    });
    const partial = await availability(`date=${NEXT_TUESDAY}`);
    expect(partial.body.bookable).toBe(true);
    expect(partial.body.carts.find((cart) => cart.cartId === cart1)).toMatchObject({
      block: { kind: "BLOCK", reason: "Carrinho em revisão" },
      free: [],
    });
  });

  it("mostra a quantidade operacional de equipamentos do carrinho", async () => {
    await ctx.db.insert(chromebooks).values([
      { assetTag: "A1", name: "A1", brandModel: "Acer", cartId: cart1, status: "AVAILABLE" },
      { assetTag: "A2", name: "A2", brandModel: "Acer", cartId: cart1, status: "MAINTENANCE" },
    ]);

    const { body } = await availability(`date=${NEXT_TUESDAY}&cartId=${cart1}`);

    expect(body.carts[0]!.availableEquipment).toBe(1);
  });

  it("agenda retorna reservas confirmadas, bloqueios e o dia atual de São Paulo", async () => {
    await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
    const cancelled = (await (await postReservation(professor, { cartId: cart2, startTime: "08:00", endTime: "09:00" })).json()) as ReservationDto;
    await cancelReservationRequest(professor, cancelled.id);
    await ctx.db.insert(calendarBlocks).values({ kind: "HOLIDAY_NATIONAL", startDate: "2030-03-20", endDate: "2030-03-20", reason: "Feriado" });

    const { status, body } = await calendar("from=2030-03-01&to=2030-03-31");

    expect(status).toBe(200);
    expect(body.today).toBe(TODAY);
    expect(body.hours).toEqual({ openingTime: "07:00", closingTime: "18:00", slotMinutes: 5 });
    expect(body.carts.map((cart) => cart.name)).toEqual(["Carrinho 1", "Carrinho 2"]);
    expect(body.reservations).toHaveLength(1);
    expect(body.reservations[0]).toMatchObject({ cartId: cart1, teacherName: "Ana Souza", className: "7º A" });
    expect(body.blocks).toMatchObject([{ kind: "HOLIDAY_NATIONAL", startDate: "2030-03-20" }]);
    expect(JSON.stringify(body)).not.toContain(professor.email);
  });

  it("agenda filtra por carrinho e valida o período", async () => {
    await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
    await postReservation(professor, { cartId: cart2, startTime: "08:00", endTime: "09:00" });

    const filtered = await calendar(`from=2030-03-01&to=2030-03-31&cartId=${cart2}`);
    expect(filtered.body.reservations.map((reservation) => reservation.cartId)).toEqual([cart2]);

    expect((await calendar("from=2030-03-31&to=2030-03-01")).status).toBe(422);
    expect((await calendar("from=2030-01-01&to=2030-06-30")).status).toBe(422);
    expect((await calendar("from=2030-03-01")).status).toBe(422);
  });
});
