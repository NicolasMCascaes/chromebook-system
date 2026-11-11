import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ReservationDto } from "@chromebook/shared";
import * as reservationRoute from "@/app/api/reservations/[id]/route";
import { calendarBlocks, carts, reservations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import {
  cancelReservationRequest,
  LAST_FRIDAY,
  NEXT_TUESDAY,
  postReservation,
  SATURDAY,
  seedCarts,
  SUNDAY,
  TODAY,
} from "./helpers/reservations";

describe("reservas", () => {
  let ctx: TestContext;
  let professor: TestUser;
  let otherProfessor: TestUser;
  let admin: TestUser;
  let cart1: string;
  let cart2: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    professor = await ctx.createUser("PROFESSOR", { name: "Ana Souza" });
    otherProfessor = await ctx.createUser("PROFESSOR", { name: "Bruno Lima" });
    admin = await ctx.createUser("ADMIN");
    ({ cart1, cart2 } = await seedCarts(ctx));
  });

  afterAll(() => ctx.close());

  const expectRule = async (response: Response, code: string) => {
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code });
  };

  describe("criação", () => {
    it("confirma imediatamente e usa o professor do token, ignorando proprietário enviado no corpo", async () => {
      const response = await postReservation(professor, {
        cartId: cart1,
        startTime: "08:00",
        endTime: "09:40",
        notes: "Aula de pesquisa",
        userId: otherProfessor.id,
      });

      expect(response.status).toBe(201);
      const reservation = (await response.json()) as ReservationDto;
      expect(reservation).toMatchObject({
        cartId: cart1,
        cartName: "Carrinho 1",
        teacherName: "Ana Souza",
        className: "7º A",
        date: NEXT_TUESDAY,
        startTime: "08:00",
        endTime: "09:40",
        status: "CONFIRMED",
        notes: "Aula de pesquisa",
        isOwner: true,
        canCancel: true,
      });
      const [stored] = await ctx.db.select().from(reservations).where(eq(reservations.id, reservation.id));
      expect(stored!.userId).toBe(professor.id);
    });

    it("não expõe e-mail e oculta a observação para outros professores", async () => {
      const created = (await (
        await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00", notes: "Particular" })
      ).json()) as ReservationDto;

      const asOther = await reservationRoute.GET(
        apiRequest(`/api/reservations/${created.id}`, { token: otherProfessor.token }),
        params({ id: created.id }),
      );
      const body = (await asOther.json()) as Record<string, unknown>;

      expect(body).toMatchObject({ teacherName: "Ana Souza", notes: null, isOwner: false, canCancel: false });
      expect(JSON.stringify(body)).not.toContain(professor.email);
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
    const create = async (user: TestUser, body: { cartId: string; startTime: string; endTime: string; date?: string }) =>
      (await (await postReservation(user, body)).json()) as ReservationDto;

    it("cancelamento libera o horário para nova reserva", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });
      expect((await postReservation(otherProfessor, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).status).toBe(409);

      const cancelled = await cancelReservationRequest(professor, reservation.id, "Aula remarcada");
      expect(cancelled.status).toBe(200);
      expect(await cancelled.json()).toMatchObject({ status: "CANCELLED", canCancel: false });

      expect((await postReservation(otherProfessor, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).status).toBe(201);
    });

    it("professor não cancela reserva de outro professor", async () => {
      const reservation = await create(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" });

      expect((await cancelReservationRequest(otherProfessor, reservation.id)).status).toBe(403);
      const [stored] = await ctx.db.select().from(reservations).where(eq(reservations.id, reservation.id));
      expect(stored!.status).toBe("CONFIRMED");
    });

    it("professor não cancela a própria reserva que já começou", async () => {
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

    it("chaves iguais de professores diferentes não se confundem", async () => {
      const key = crypto.randomUUID();
      expect((await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }, key)).status).toBe(201);
      expect((await postReservation(otherProfessor, { cartId: cart2, startTime: "08:00", endTime: "09:00" }, key)).status).toBe(201);
    });

    it("exige cabeçalho Idempotency-Key válido", async () => {
      expect((await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }, null)).status).toBe(400);
      expect((await postReservation(professor, { cartId: cart1, startTime: "08:00", endTime: "09:00" }, "abc")).status).toBe(400);
    });
  });
});
