import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ReservationDto } from "@chromebook/shared";
import * as reservationRoute from "@/app/api/reservations/[id]/route";
import { calendarBlocks, carts, reservations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import {
  cancelReservationRequest,
  createTeacher,
  LAST_FRIDAY,
  NEXT_TUESDAY,
  postReservation,
  SATURDAY,
  type Teacher,
  seedCarts,
  SUNDAY,
  TODAY,
} from "./helpers/reservations";

describe("reservas", () => {
  let ctx: TestContext;
  let professor: Teacher;
  let otherProfessor: Teacher;
  let admin: TestUser;
  let cart1: string;
  let cart2: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    professor = createTeacher("Ana Souza");
    otherProfessor = createTeacher("Bruno Lima");
    admin = await ctx.createUser("ADMIN");
    ({ cart1, cart2 } = await seedCarts(ctx));
  });

  afterAll(() => ctx.close());

  const expectRule = async (response: Response, code: string) => {
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code });
  };

  describe("criação", () => {
    it("confirma sem login, grava o nome informado e guarda apenas o hash do código de cancelamento", async () => {
      const response = await postReservation(professor, {
        cartId: cart1,
        startTime: "08:00",
        endTime: "09:40",
        notes: "Aula de pesquisa",
        userId: admin.id,
      });

      expect(response.status).toBe(201);
      const reservation = (await response.json()) as ReservationDto;
      expect(reservation).toMatchObject({
        cartId: cart1,
        cartName: "Carrinho 1",
        teacherName: "Ana Souza",
        className: "7º ano",
        date: NEXT_TUESDAY,
        startTime: "08:00",
        endTime: "09:40",
        status: "PENDING",
        notes: "Aula de pesquisa",
        canCancel: true,
      });
      const [stored] = await ctx.db.select().from(reservations).where(eq(reservations.id, reservation.id));
      expect(stored!.userId).toBeNull();
      expect(stored!.cancelTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored!.cancelTokenHash).not.toContain(professor.cancelToken);
    });

    it("exige nome do professor e código de cancelamento válido", async () => {
      const response = await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00", teacherName: " " });
      expect(response.status).toBe(422);
      const weakToken = await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00", cancelToken: "123" });
      expect(weakToken.status).toBe(422);
    });

    it("oculta a observação no acesso público e mostra a quem tem o código", async () => {
      const created = (await (
        await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00", notes: "Particular" })
      ).json()) as ReservationDto;

      const publicView = await reservationRoute.GET(apiRequest(`/api/reservations/${created.id}`), params({ id: created.id }));
      expect(await publicView.json()).toMatchObject({ teacherName: "Ana Souza", notes: null });

      const ownerView = await reservationRoute.GET(
        apiRequest(`/api/reservations/${created.id}`, { headers: { "x-cancel-token": professor.cancelToken } }),
        params({ id: created.id }),
      );
      expect(await ownerView.json()).toMatchObject({ notes: "Particular" });
    });

    it("token inválido ou de professor não vale como acesso de administrador", async () => {
      const legacyProfessor = await ctx.createUser("PROFESSOR");
      expect((await postReservation(legacyProfessor, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).status).toBe(403);
      const invalid = await reservationRoute.GET(
        apiRequest(`/api/reservations/${crypto.randomUUID()}`, { token: "invalido" }),
        params({ id: crypto.randomUUID() }),
      );
      expect(invalid.status).toBe(401);
    });

    it.each([
      ["começa dentro", "08:30", "09:30"],
      ["termina dentro", "07:30", "08:30"],
      ["está contida", "08:15", "08:45"],
      ["contém a existente", "07:00", "10:00"],
      ["é idêntica", "08:00", "09:00"],
    ])("recusa com 409 reserva no mesmo carrinho que %s", async (_label, startTime, endTime) => {
      expect((await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).status).toBe(201);

      const response = await postReservation(otherProfessor, { cartId: cart1, startTime, endTime });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "RESERVATION_CONFLICT" });
    });

    it("permite horários consecutivos no mesmo carrinho", async () => {
      expect((await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).status).toBe(201);
      expect((await postReservation(otherProfessor, { cartId: cart1, startTime: "09:00", endTime: "10:00" })).status).toBe(201);
      expect((await postReservation(otherProfessor, { cartId: cart1, startTime: "07:00", endTime: "08:00" })).status).toBe(201);
    });

    it("permite carrinhos diferentes no mesmo horário", async () => {
      expect((await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).status).toBe(201);
      expect((await postReservation(otherProfessor, { cartId: cart2, startTime: "08:00", endTime: "09:00" })).status).toBe(201);
    });

    it("permite o mesmo horário em outro dia", async () => {
      expect((await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).status).toBe(201);
      expect(
        (await postReservation(otherProfessor, { cartId: cart1, date: "2030-03-06", startTime: "08:00", endTime: "09:00" })).status,
      ).toBe(201);
    });
  });

  describe("regras de data e horário", () => {
    it("recusa sábados e domingos", async () => {
      await expectRule(await postReservation(professor, { cartId: cart1, date: SATURDAY, startTime: "08:00", endTime: "09:00" }), "WEEKEND");
      await expectRule(await postReservation(professor, { cartId: cart1, date: SUNDAY, startTime: "08:00", endTime: "09:00" }), "WEEKEND");
    });

    it("recusa datas passadas e horários que já passaram hoje", async () => {
      await expectRule(await postReservation(professor, { cartId: cart1, date: LAST_FRIDAY, startTime: "08:00", endTime: "09:00" }), "PAST");
      await expectRule(await postReservation(professor, { cartId: cart1, date: TODAY, startTime: "09:00", endTime: "11:00" }), "PAST");
      expect((await postReservation(professor, { cartId: cart1, date: TODAY, startTime: "10:00", endTime: "11:00" })).status).toBe(201);
    });

    it("usa o fuso de São Paulo para definir o dia atual", async () => {
      ctx.clock.set("2030-03-05T02:30:00Z");

      expect((await postReservation(professor, { cartId: cart1, date: TODAY, startTime: "17:00", endTime: "18:00" })).status).toBe(422);
      expect((await postReservation(professor, { cartId: cart1, date: NEXT_TUESDAY, startTime: "07:00", endTime: "08:00" })).status).toBe(201);
    });

    it("recusa término igual ou anterior ao início", async () => {
      const equal = await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "08:00" });
      const reversed = await postReservation(professor, { cartId: cart1, startTime: "09:00", endTime: "08:00" });

      for (const response of [equal, reversed]) {
        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({ details: [{ path: "endTime" }] });
      }
    });

    it("recusa horário fora do funcionamento ou desalinhado com a granularidade", async () => {
      await expectRule(await postReservation(professor, { cartId: cart1, startTime: "06:30", endTime: "08:00" }), "OUTSIDE_SCHOOL_HOURS");
      await expectRule(await postReservation(professor, { cartId: cart1, startTime: "17:00", endTime: "18:30" }), "OUTSIDE_SCHOOL_HOURS");
      await expectRule(await postReservation(professor, { cartId: cart1, startTime: "08:02", endTime: "09:00" }), "SLOT_MISALIGNED");
    });

    it("respeita o horário de funcionamento configurado", async () => {
      await ctx.client`update app.school_settings set opening_time = '12:00', closing_time = '22:00', slot_minutes = 30`;

      await expectRule(await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }), "OUTSIDE_SCHOOL_HOURS");
      await expectRule(await postReservation(professor, { cartId: cart1, startTime: "19:15", endTime: "20:00" }), "SLOT_MISALIGNED");
      expect((await postReservation(professor, { cartId: cart1, startTime: "19:30", endTime: "21:00" })).status).toBe(201);
    });

    it("recusa formatos inválidos de data e hora", async () => {
      expect((await postReservation(professor, { cartId: cart1, date: "05/03/2030", startTime: "08:00", endTime: "09:00" })).status).toBe(422);
      expect((await postReservation(professor, { cartId: cart1, date: "2030-02-30", startTime: "08:00", endTime: "09:00" })).status).toBe(422);
      expect((await postReservation(professor, { cartId: cart1, startTime: "8h", endTime: "09:00" })).status).toBe(422);
    });

    it("aceita apenas as turmas cadastradas", async () => {
      const response = await postReservation(professor, { cartId: cart1, className: "1º EM", startTime: "08:00", endTime: "09:00" });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ details: [{ path: "className", message: "Selecione a turma." }] });
      expect((await postReservation(createTeacher(), { cartId: cart1, className: "5º B", startTime: "08:00", endTime: "09:00" })).status).toBe(201);
    });
  });

  describe("bloqueios e carrinhos indisponíveis", () => {
    it("recusa data com bloqueio para todos os carrinhos", async () => {
      await ctx.db.insert(calendarBlocks).values({
        kind: "BLOCK",
        startDate: "2030-03-04",
        endDate: "2030-03-06",
        reason: "Semana de provas",
      });

      const response = await postReservation(professor, { cartId: cart2, startTime: "08:00", endTime: "09:00" });

      await expectRule(response.clone(), "DATE_BLOCKED");
      expect(((await response.json()) as { message: string }).message).toContain("Semana de provas");
    });

    it("bloqueio de um carrinho não afeta os demais", async () => {
      await ctx.db.insert(calendarBlocks).values({
        kind: "BLOCK",
        startDate: NEXT_TUESDAY,
        endDate: NEXT_TUESDAY,
        reason: "Manutenção do carrinho",
        cartId: cart1,
      });

      await expectRule(await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }), "DATE_BLOCKED");
      expect((await postReservation(professor, { cartId: cart2, startTime: "08:00", endTime: "09:00" })).status).toBe(201);
    });

    it("recusa feriados e recessos", async () => {
      await ctx.db.insert(calendarBlocks).values([
        { kind: "HOLIDAY_MUNICIPAL", startDate: NEXT_TUESDAY, endDate: NEXT_TUESDAY, reason: "Aniversário da cidade" },
        { kind: "SCHOOL_RECESS", startDate: "2030-03-11", endDate: "2030-03-15", reason: "Recesso" },
      ]);

      await expectRule(await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }), "DATE_BLOCKED");
      await expectRule(
        await postReservation(professor, { cartId: cart1, date: "2030-03-13", startTime: "08:00", endTime: "09:00" }),
        "DATE_BLOCKED",
      );
      expect((await postReservation(professor, { cartId: cart1, date: "2030-03-06", startTime: "08:00", endTime: "09:00" })).status).toBe(201);
    });

    it("recusa carrinho inativo ou inexistente", async () => {
      await ctx.db.update(carts).set({ active: false }).where(eq(carts.id, cart1));

      await expectRule(await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }), "CART_UNAVAILABLE");
      await expectRule(
        await postReservation(professor, { cartId: crypto.randomUUID(), startTime: "08:00", endTime: "09:00" }),
        "CART_UNAVAILABLE",
      );
    });
  });

  describe("cancelamento", () => {
    const create = async (user: Teacher, body: { cartId: string; startTime: string; endTime: string; date?: string }) =>
      (await (await postReservation(user, body)).json()) as ReservationDto;

    it("cancelamento libera o horário para nova reserva", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
      expect((await postReservation(otherProfessor, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).status).toBe(409);

      const cancelled = await cancelReservationRequest(professor, reservation.id, "Aula remarcada");
      expect(cancelled.status).toBe(200);
      expect(await cancelled.json()).toMatchObject({ status: "CANCELLED", canCancel: false });

      expect((await postReservation(otherProfessor, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).status).toBe(201);
    });

    it("sem o código de cancelamento correto não é possível cancelar", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });

      expect((await cancelReservationRequest(otherProfessor, reservation.id)).status).toBe(403);
      const [stored] = await ctx.db.select().from(reservations).where(eq(reservations.id, reservation.id));
      expect(stored!.status).toBe("PENDING");
    });

    it("com o código, não cancela reserva que já começou", async () => {
      const reservation = await create(professor, { cartId: cart1, date: TODAY, startTime: "11:00", endTime: "12:00" });
      ctx.clock.set("2030-03-04T14:00:00Z");

      await expectRule(await cancelReservationRequest(professor, reservation.id), "RESERVATION_STARTED");
    });

    it("administrador cancela reservas de qualquer professor", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });

      const response = await cancelReservationRequest(admin, reservation.id);

      expect(response.status).toBe(200);
      const [stored] = await ctx.db.select().from(reservations).where(eq(reservations.id, reservation.id));
      expect(stored).toMatchObject({ status: "CANCELLED", cancelledBy: admin.id });
    });

    it("cancelar novamente é idempotente e reserva inexistente retorna 404", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
      await cancelReservationRequest(professor, reservation.id);

      expect((await cancelReservationRequest(professor, reservation.id)).status).toBe(200);
      expect((await cancelReservationRequest(professor, crypto.randomUUID())).status).toBe(404);
    });
  });

  describe("idempotência", () => {
    it("repetir a mesma requisição devolve a mesma reserva sem duplicar", async () => {
      const key = crypto.randomUUID();
      const body = { cartId: cart1, startTime: "08:00", endTime: "09:00" };

      const first = await postReservation(professor, body, key);
      const second = await postReservation(professor, body, key);

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(((await second.json()) as ReservationDto).id).toBe(((await first.json()) as ReservationDto).id);
      expect(await ctx.db.select().from(reservations)).toHaveLength(1);
    });

    it("recusa a mesma chave com dados diferentes", async () => {
      const key = crypto.randomUUID();
      await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }, key);

      const response = await postReservation(professor, { cartId: cart1, startTime: "10:00", endTime: "11:00" }, key);

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    });

    it("a chave é global: reutilizá-la com outros dados é recusada", async () => {
      const key = crypto.randomUUID();
      expect((await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }, key)).status).toBe(201);
      expect((await postReservation(otherProfessor, { cartId: cart2, startTime: "08:00", endTime: "09:00" }, key)).status).toBe(422);
    });

    it("exige cabeçalho Idempotency-Key válido", async () => {
      expect((await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }, null)).status).toBe(400);
      expect((await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }, "abc")).status).toBe(400);
    });
  });
});
