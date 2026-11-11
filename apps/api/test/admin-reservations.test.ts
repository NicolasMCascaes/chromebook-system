import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AdminReservationDto, ReservationDto } from "@chromebook/shared";
import * as listRoute from "@/app/api/admin/reservations/route";
import * as editRoute from "@/app/api/admin/reservations/[id]/route";
import * as adminCancelRoute from "@/app/api/admin/reservations/[id]/cancel/route";
import { calendarBlocks } from "@/lib/db/schema";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import {
  cancelReservationRequest,
  createTeacher,
  NEXT_TUESDAY,
  postReservation,
  seedCarts,
  TODAY,
  type Teacher,
} from "./helpers/reservations";

describe("reservas na coordenação", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let professor: Teacher;
  let cart1: string;
  let cart2: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    admin = await ctx.createUser("ADMIN");
    professor = createTeacher("Ana Souza");
    ({ cart1, cart2 } = await seedCarts(ctx));
  });

  afterAll(() => ctx.close());

  const create = async (actor: Teacher, body: Parameters<typeof postReservation>[1]) => {
    const response = await postReservation(actor, body);
    expect(response.status).toBe(201);
    return (await response.json()) as ReservationDto;
  };

  const list = (query: string, token = admin.token) =>
    listRoute.GET(apiRequest(`/api/admin/reservations?${query}`, { token }), params());

  const edit = (id: string, body: unknown, token = admin.token) =>
    editRoute.PATCH(apiRequest(`/api/admin/reservations/${id}`, { method: "PATCH", token, body }), params({ id }));

  describe("listagem", () => {
    it("lista confirmadas e canceladas com observação e motivo do cancelamento", async () => {
      const kept = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00", notes: "Projeto" });
      const cancelled = await create(professor, { cartId: cart2, startTime: "08:00", endTime: "09:00" });
      await cancelReservationRequest(admin, cancelled.id, "Turma em passeio");

      const response = await list(`from=${TODAY}&to=${NEXT_TUESDAY}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as AdminReservationDto[];
      expect(body).toHaveLength(2);
      expect(body.find((item) => item.id === kept.id)).toMatchObject({ notes: "Projeto", status: "CONFIRMED" });
      expect(body.find((item) => item.id === cancelled.id)).toMatchObject({
        status: "CANCELLED",
        cancelReason: "Turma em passeio",
      });
    });

    it("filtra por situação, carrinho e busca por professor ou turma", async () => {
      await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00", className: "8º B" });
      await create(createTeacher("Bruno Lima"), { cartId: cart2, startTime: "08:00", endTime: "09:00" });
      const cancelled = await create(professor, { cartId: cart2, startTime: "10:00", endTime: "11:00" });
      await cancelReservationRequest(admin, cancelled.id);

      const names = async (query: string) =>
        ((await (await list(`from=${TODAY}&to=${NEXT_TUESDAY}&${query}`)).json()) as AdminReservationDto[]).map(
          (item) => `${item.teacherName}/${item.status}`,
        );

      expect(await names("status=CONFIRMED")).toEqual(["Ana Souza/CONFIRMED", "Bruno Lima/CONFIRMED"]);
      expect(await names(`cartId=${cart2}`)).toEqual(["Bruno Lima/CONFIRMED", "Ana Souza/CANCELLED"]);
      expect(await names("search=bruno")).toEqual(["Bruno Lima/CONFIRMED"]);
      expect(await names("search=8º")).toEqual(["Ana Souza/CONFIRMED"]);
      expect(await names("search=%25")).toEqual([]);
    });

    it("exige administrador", async () => {
      const professorUser = await ctx.createUser("PROFESSOR");
      expect((await list(`from=${TODAY}&to=${TODAY}`, professorUser.token)).status).toBe(403);
      expect((await listRoute.GET(apiRequest(`/api/admin/reservations?from=${TODAY}&to=${TODAY}`), params())).status).toBe(401);
    });

    it("recusa período invertido", async () => {
      const response = await list(`from=${NEXT_TUESDAY}&to=${TODAY}`);
      expect(response.status).toBe(422);
    });
  });

  describe("cancelamento pela coordenação", () => {
    it("cancela qualquer reserva, inclusive já iniciada, registrando o motivo", async () => {
      const reservation = await create(professor, { cartId: cart1, date: TODAY, startTime: "10:30", endTime: "11:30" });
      ctx.clock.set("2030-03-04T13:45:00Z");
      const cancel = (token: string | undefined) =>
        adminCancelRoute.POST(
          apiRequest(`/api/admin/reservations/${reservation.id}/cancel`, { method: "POST", token, body: { reason: "Pedido da professora" } }),
          params({ id: reservation.id }),
        );

      const professorUser = await ctx.createUser("PROFESSOR");
      expect((await cancel(undefined)).status).toBe(401);
      expect((await cancel(professorUser.token)).status).toBe(403);

      const response = await cancel(admin.token);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "CANCELLED", canCancel: false });
      const [row] = await ctx.client<{ cancel_reason: string; cancelled_by: string }[]>`
        select cancel_reason, cancelled_by from app.reservations where id = ${reservation.id}
      `;
      expect(row).toEqual({ cancel_reason: "Pedido da professora", cancelled_by: admin.id });
    });
  });

  describe("edição", () => {
    it("corrige nome, turma e observação", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
      const response = await edit(reservation.id, { teacherName: "Ana Paula Souza", className: "9º C", notes: null });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ teacherName: "Ana Paula Souza", className: "9º C", notes: null });
    });

    it("remarca para outro horário e carrinho, liberando o horário anterior", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
      const response = await edit(reservation.id, { cartId: cart2, startTime: "13:00", endTime: "14:30" });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ cartId: cart2, startTime: "13:00", endTime: "14:30" });

      const other = await postReservation(createTeacher("Bruno"), { cartId: cart1, startTime: "08:00", endTime: "09:00" });
      expect(other.status).toBe(201);
    });

    it("devolve 409 ao remarcar sobre outra reserva", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
      await create(createTeacher("Bruno"), { cartId: cart2, startTime: "08:30", endTime: "09:30" });
      const response = await edit(reservation.id, { cartId: cart2 });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "RESERVATION_CONFLICT" });
    });

    it("aplica as regras de data, horário e bloqueio na remarcação", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
      await ctx.db.insert(calendarBlocks).values({ kind: "BLOCK", startDate: "2030-03-06", endDate: "2030-03-06", reason: "Manutenção", cartId: cart1 });

      const expectRule = async (body: unknown, code: string) => {
        const response = await edit(reservation.id, body);
        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({ code });
      };
      await expectRule({ date: "2030-03-09" }, "WEEKEND");
      await expectRule({ date: "2030-03-01" }, "PAST");
      await expectRule({ startTime: "09:30" }, "INVALID_TIME_RANGE");
      await expectRule({ endTime: "19:00" }, "OUTSIDE_SCHOOL_HOURS");
      await expectRule({ date: "2030-03-06" }, "DATE_BLOCKED");
    });

    it("não altera reserva cancelada nem remarca reserva já iniciada", async () => {
      const cancelled = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
      await cancelReservationRequest(admin, cancelled.id);
      expect(await (await edit(cancelled.id, { className: "6º A" })).json()).toMatchObject({ code: "RESERVATION_CANCELLED" });

      const started = await create(professor, { cartId: cart2, date: TODAY, startTime: "10:30", endTime: "11:30" });
      ctx.clock.set("2030-03-04T13:45:00Z");
      expect(await (await edit(started.id, { endTime: "12:00" })).json()).toMatchObject({ code: "RESERVATION_STARTED" });
      expect((await edit(started.id, { className: "6º A" })).status).toBe(200);
    });

    it("recusa corpo vazio e reserva inexistente", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
      expect((await edit(reservation.id, {})).status).toBe(422);
      expect((await edit("00000000-0000-4000-8000-000000000000", { className: "6º A" })).status).toBe(404);
    });
  });
});
