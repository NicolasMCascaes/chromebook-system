import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_RESERVATION_SLOTS, type ReservationBatchDto, type ReservationDto } from "@chromebook/shared";
import * as batchRoute from "@/app/api/reservations/batch/route";
import { calendarBlocks, notificationOutbox, reservations } from "@/lib/db/schema";
import { createTestContext, type TestContext } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import {
  cancelReservationRequest,
  createTeacher,
  NEXT_TUESDAY,
  newCancelToken,
  postReservation,
  seedCarts,
  useFiveMinutePeriods,
  type Teacher,
} from "./helpers/reservations";

const NEXT_WEDNESDAY = "2030-03-06";

interface SlotBody {
  cartId: string;
  className?: string;
  date?: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
  cancelToken?: string;
}

function slot(body: SlotBody) {
  return { className: "7º ano", date: NEXT_TUESDAY, notes: null, cancelToken: newCancelToken(), ...body };
}

function postBatch(teacherName: string, slots: unknown[], idempotencyKey: string = randomUUID()) {
  return batchRoute.POST(
    apiRequest("/api/reservations/batch", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: { teacherName, slots },
    }),
    params(),
  );
}

describe("reserva de vários horários em um envio", () => {
  let ctx: TestContext;
  let cart1: string;
  let cart2: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    await useFiveMinutePeriods(ctx);
    ({ cart1, cart2 } = await seedCarts(ctx));
  });

  afterAll(() => ctx.close());

  const countReservations = async () => (await ctx.db.select().from(reservations)).length;

  it("cria uma reserva aguardando aprovação com um único horário", async () => {
    const response = await postBatch("Ana Souza", [slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" })]);

    expect(response.status).toBe(201);
    const body = (await response.json()) as ReservationBatchDto;
    expect(body.reservations).toHaveLength(1);
    expect(body.reservations[0]).toMatchObject({ teacherName: "Ana Souza", status: "PENDING", cartId: cart1, canCancel: true });
  });

  it("cria três reservas separadas com o nome informado uma vez e um e-mail por reserva", async () => {
    await ctx.client`update app.school_settings set notification_emails = ${["ti@escola.test"]}`;
    const slots = [
      slot({ cartId: cart1, startTime: "08:00", endTime: "09:00", notes: "Pesquisa" }),
      slot({ cartId: cart1, className: "6º A", startTime: "10:00", endTime: "11:00" }),
      slot({ cartId: cart2, date: NEXT_WEDNESDAY, startTime: "08:00", endTime: "09:00" }),
    ];

    const response = await postBatch("Ana Souza", slots);

    expect(response.status).toBe(201);
    const { reservations: created } = (await response.json()) as ReservationBatchDto;
    expect(created.map((entry) => [entry.teacherName, entry.className, entry.date, entry.startTime, entry.status])).toEqual([
      ["Ana Souza", "7º ano", NEXT_TUESDAY, "08:00", "PENDING"],
      ["Ana Souza", "6º A", NEXT_TUESDAY, "10:00", "PENDING"],
      ["Ana Souza", "7º ano", NEXT_WEDNESDAY, "08:00", "PENDING"],
    ]);
    expect(new Set(created.map((entry) => entry.id)).size).toBe(3);
    const outbox = await ctx.db.select().from(notificationOutbox);
    expect(outbox.map((row) => row.reservationId).sort()).toEqual(created.map((entry) => entry.id).sort());
  });

  it("cada horário pode ser cancelado sozinho com o código do próprio horário", async () => {
    const tokens = [newCancelToken(), newCancelToken()];
    const response = await postBatch("Ana Souza", [
      slot({ cartId: cart1, startTime: "08:00", endTime: "09:00", cancelToken: tokens[0] }),
      slot({ cartId: cart1, startTime: "10:00", endTime: "11:00", cancelToken: tokens[1] }),
    ]);
    const { reservations: created } = (await response.json()) as ReservationBatchDto;

    const wrongToken = await cancelReservationRequest({ name: "Ana Souza", cancelToken: tokens[1]! }, created[0]!.id);
    expect(wrongToken.status).toBe(403);
    const cancelled = await cancelReservationRequest({ name: "Ana Souza", cancelToken: tokens[0]! }, created[0]!.id);
    expect(((await cancelled.json()) as ReservationDto).status).toBe("CANCELLED");
    const [kept] = await ctx.client<{ status: string }[]>`select status from app.reservations where id = ${created[1]!.id}`;
    expect(kept!.status).toBe("PENDING");
  });

  it("recusa tudo quando um horário conflita com reserva existente e aponta o horário", async () => {
    const other: Teacher = createTeacher("Bruno Lima");
    expect((await postReservation(other, { cartId: cart1, startTime: "10:00", endTime: "11:00" })).status).toBe(201);

    const response = await postBatch("Ana Souza", [
      slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" }),
      slot({ cartId: cart1, startTime: "10:30", endTime: "11:30" }),
    ]);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ code: "RESERVATION_CONFLICT", details: [{ path: "slots.1.cartId" }] });
    expect(body.message).toContain("Horário 2");
    expect(await countReservations()).toBe(1);
  });

  it("recusa horários do mesmo pedido que se sobrepõem no mesmo carrinho", async () => {
    const response = await postBatch("Ana Souza", [
      slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" }),
      slot({ cartId: cart2, startTime: "08:00", endTime: "09:00" }),
      slot({ cartId: cart1, startTime: "08:30", endTime: "09:30" }),
    ]);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ details: [{ path: "slots.2.cartId" }] });
    expect(await countReservations()).toBe(0);
  });

  it("aceita o mesmo horário em datas diferentes ou carrinhos diferentes", async () => {
    const response = await postBatch("Ana Souza", [
      slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" }),
      slot({ cartId: cart1, date: NEXT_WEDNESDAY, startTime: "08:00", endTime: "09:00" }),
      slot({ cartId: cart2, startTime: "08:00", endTime: "09:00" }),
    ]);

    expect(response.status).toBe(201);
  });

  it("falha parcial não cria nada: data bloqueada no terceiro horário desfaz os anteriores", async () => {
    await ctx.client`update app.school_settings set notification_emails = ${["ti@escola.test"]}`;
    await ctx.db.insert(calendarBlocks).values({ kind: "BLOCK", startDate: NEXT_WEDNESDAY, endDate: NEXT_WEDNESDAY, reason: "Manutenção" });

    const response = await postBatch("Ana Souza", [
      slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" }),
      slot({ cartId: cart2, startTime: "08:00", endTime: "09:00" }),
      slot({ cartId: cart1, date: NEXT_WEDNESDAY, startTime: "08:00", endTime: "09:00" }),
    ]);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "DATE_BLOCKED", details: [{ path: "slots.2.date" }] });
    expect(await countReservations()).toBe(0);
    expect(await ctx.db.select().from(notificationOutbox)).toHaveLength(0);
  });

  it("valida a grade de aulas pela turma de cada horário", async () => {
    await ctx.reset();
    ({ cart1, cart2 } = await seedCarts(ctx));

    const response = await postBatch("Ana Souza", [
      slot({ cartId: cart1, className: "7º ano", startTime: "09:20", endTime: "10:10" }),
      slot({ cartId: cart2, className: "9º ano", startTime: "09:20", endTime: "10:10" }),
    ]);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "OUTSIDE_CLASS_PERIODS", details: [{ path: "slots.1.startTime" }] });
    expect(await countReservations()).toBe(0);
  });

  it("exige a turma em cada horário", async () => {
    const withoutClass = { ...slot({ cartId: cart2, startTime: "08:00", endTime: "09:00" }), className: undefined };
    const response = await postBatch("Ana Souza", [slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" }), withoutClass]);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.details).toContainEqual({ path: "slots.1.className", message: "Selecione a turma." });
  });

  it(`aceita até ${MAX_RESERVATION_SLOTS} horários e recusa mais`, async () => {
    const make = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        slot({ cartId: cart1, startTime: `${String(8 + index).padStart(2, "0")}:00`, endTime: `${String(8 + index).padStart(2, "0")}:30` }),
      );

    const tooMany = await postBatch("Ana Souza", make(MAX_RESERVATION_SLOTS + 1));
    expect(tooMany.status).toBe(422);
    expect(await countReservations()).toBe(0);

    const atLimit = await postBatch("Ana Souza", make(MAX_RESERVATION_SLOTS));
    expect(atLimit.status).toBe(201);
    expect(await countReservations()).toBe(MAX_RESERVATION_SLOTS);
  });

  it("recusa pedido vazio e nome em branco", async () => {
    expect((await postBatch("Ana Souza", [])).status).toBe(422);
    expect((await postBatch("  ", [slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" })])).status).toBe(422);
    expect(await countReservations()).toBe(0);
  });

  it("repetir o envio com a mesma chave devolve as mesmas reservas sem duplicar", async () => {
    const key = randomUUID();
    const slots = [
      slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" }),
      slot({ cartId: cart1, startTime: "10:00", endTime: "11:00" }),
    ];

    const first = await postBatch("Ana Souza", slots, key);
    const second = await postBatch("Ana Souza", slots, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const firstIds = ((await first.json()) as ReservationBatchDto).reservations.map((entry) => entry.id);
    const secondIds = ((await second.json()) as ReservationBatchDto).reservations.map((entry) => entry.id);
    expect(secondIds).toEqual(firstIds);
    expect(await countReservations()).toBe(2);

    const changed = await postBatch("Ana Souza", [slots[0]], key);
    expect(changed.status).toBe(422);
    expect(await changed.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("dois envios simultâneos disputando o mesmo horário: um entra inteiro e o outro não cria nada", async () => {
    const responses = await Promise.all([
      postBatch("Ana Souza", [
        slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" }),
        slot({ cartId: cart2, startTime: "10:00", endTime: "11:00" }),
      ]),
      postBatch("Bruno Lima", [
        slot({ cartId: cart2, startTime: "07:00", endTime: "07:30" }),
        slot({ cartId: cart1, startTime: "08:30", endTime: "09:30" }),
      ]),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const rows = await ctx.client<{ teacher_name: string }[]>`select teacher_name from app.reservations`;
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.teacher_name)).size).toBe(1);
  });

  it("o formato antigo de um horário em /api/reservations continua funcionando", async () => {
    const response = await postReservation(createTeacher("Ana Souza"), { cartId: cart1, startTime: "08:00", endTime: "09:00" });

    expect(response.status).toBe(201);
    expect(((await response.json()) as ReservationDto).status).toBe("PENDING");
  });

  it("recusa o formato antigo enviado ao endpoint de vários horários", async () => {
    const response = await batchRoute.POST(
      apiRequest("/api/reservations/batch", {
        method: "POST",
        headers: { "idempotency-key": randomUUID() },
        body: { teacherName: "Ana Souza", ...slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" }) },
      }),
      params(),
    );

    expect(response.status).toBe(422);
    expect(await countReservations()).toBe(0);
  });

  it("exige o cabeçalho Idempotency-Key", async () => {
    const response = await batchRoute.POST(
      apiRequest("/api/reservations/batch", {
        method: "POST",
        body: { teacherName: "Ana Souza", slots: [slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" })] },
      }),
      params(),
    );

    expect(response.status).toBe(400);
  });

  it("exige o código de acesso", async () => {
    const response = await batchRoute.POST(
      apiRequest("/api/reservations/batch", {
        method: "POST",
        accessCode: null,
        headers: { "idempotency-key": randomUUID() },
        body: { teacherName: "Ana Souza", slots: [slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" })] },
      }),
      params(),
    );

    expect(response.status).toBe(403);
    expect(await countReservations()).toBe(0);
  });
});
