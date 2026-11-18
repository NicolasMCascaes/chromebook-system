import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FailedNotificationDto, ReservationBatchDto, ReservationDto } from "@chromebook/shared";
import * as batchRoute from "@/app/api/reservations/batch/route";
import * as failedRoute from "@/app/api/admin/notifications/failed/route";
import * as retryRoute from "@/app/api/admin/notifications/[id]/retry/route";
import { calendarBlocks, notificationOutbox } from "@/lib/db/schema";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import {
  cancelReservationRequest,
  createTeacher,
  NEXT_TUESDAY,
  newCancelToken,
  postReservation,
  seedCarts,
  useFiveMinutePeriods,
} from "./helpers/reservations";

const NEXT_WEDNESDAY = "2030-03-06";
const APPROVAL_LINK = /aprovacao\?reserva=([0-9a-f-]+)&codigo=[A-Za-z0-9_-]{43}/g;

interface SlotBody {
  cartId: string;
  className?: string;
  date?: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
}

function slot(body: SlotBody) {
  return { className: "7º ano", date: NEXT_TUESDAY, notes: null, cancelToken: newCancelToken(), ...body };
}

function postBatch(slots: unknown[], idempotencyKey: string = randomUUID()) {
  return batchRoute.POST(
    apiRequest("/api/reservations/batch", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: { teacherName: "Ana Souza", slots },
    }),
    params(),
  );
}

describe("e-mail do TI agrupado por envio", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let cart1: string;
  let cart2: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    await useFiveMinutePeriods(ctx);
    admin = await ctx.createUser("ADMIN");
    ({ cart1, cart2 } = await seedCarts(ctx));
    await ctx.client`update app.school_settings set notification_emails = ${["ti@escola.test"]}`;
  });

  afterAll(() => ctx.close());

  const threeSlots = () => [
    slot({ cartId: cart1, startTime: "08:00", endTime: "09:00", notes: "Pesquisa" }),
    slot({ cartId: cart1, className: "6º A", startTime: "10:00", endTime: "11:00" }),
    slot({ cartId: cart2, date: NEXT_WEDNESDAY, startTime: "08:00", endTime: "09:00" }),
  ];

  async function createdIds(response: Response): Promise<string[]> {
    const body = (await response.json()) as ReservationBatchDto;
    return body.reservations.map((reservation) => reservation.id);
  }

  async function failedList(): Promise<FailedNotificationDto[]> {
    const response = await failedRoute.GET(apiRequest("/api/admin/notifications/failed", { token: admin.token }), params());
    expect(response.status).toBe(200);
    return (await response.json()) as FailedNotificationDto[];
  }

  const retry = (id: string) =>
    retryRoute.POST(apiRequest(`/api/admin/notifications/${id}/retry`, { method: "POST", token: admin.token }), params({ id }));

  it("três horários geram um só e-mail com todos os horários e um link de aprovação para cada", async () => {
    const response = await postBatch(threeSlots());
    expect(response.status).toBe(201);
    const ids = await createdIds(response);

    const outbox = await ctx.db.select().from(notificationOutbox);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ type: "RESERVATION_REQUESTED", reservationId: ids[0], recipient: "ti@escola.test" });

    await ctx.runBackgroundTasks();

    expect(ctx.emailSender.sent).toHaveLength(1);
    const [email] = ctx.emailSender.sent;
    expect(email!.to).toBe("ti@escola.test");
    expect(email!.subject).toBe("Novo pedido de reserva: 3 horários");
    expect(email!.text).toContain("Professor: Ana Souza");
    expect(email!.text).toContain("Horário 1\nTurma: 7º ano\nCarrinho: Carrinho 1\nData: 05/03/2030\nHorário: 08:00 às 09:00\nObservação: Pesquisa");
    expect(email!.text).toContain("Horário 2\nTurma: 6º A\nCarrinho: Carrinho 1\nData: 05/03/2030\nHorário: 10:00 às 11:00");
    expect(email!.text).toContain("Horário 3\nTurma: 7º ano\nCarrinho: Carrinho 2\nData: 06/03/2030\nHorário: 08:00 às 09:00");
    expect([...email!.text.matchAll(APPROVAL_LINK)].map((match) => match[1])).toEqual(ids);

    const [sent] = await ctx.db.select().from(notificationOutbox);
    expect(sent!.status).toBe("SENT");
    expect(JSON.stringify(sent!.payload)).not.toContain("approvalToken");
    expect(sent!.payload.slots).toHaveLength(3);
  });

  it("um horário pelo envio em lote continua gerando o e-mail individual de antes", async () => {
    const batchResponse = await postBatch([slot({ cartId: cart1, startTime: "08:00", endTime: "09:00", notes: "Pesquisa" })]);
    const [batchId] = await createdIds(batchResponse);
    const singleResponse = await postReservation(createTeacher("Ana Souza"), {
      cartId: cart2,
      startTime: "08:00",
      endTime: "09:00",
      notes: "Pesquisa",
    });
    const single = (await singleResponse.json()) as ReservationDto;

    const outbox = await ctx.db.select().from(notificationOutbox);
    expect(outbox).toHaveLength(2);
    expect(outbox.every((row) => row.payload.slots === undefined)).toBe(true);

    await ctx.runBackgroundTasks();

    const byReservation = (id: string) => ctx.emailSender.sent.find((message) => message.text.includes(`reserva=${id}&`));
    const batchEmail = byReservation(batchId!);
    const singleEmail = byReservation(single.id);
    expect(batchEmail!.subject).toBe("Pedido de reserva: Carrinho 1 em 05/03/2030 (08:00–09:00)");
    expect(singleEmail!.subject).toBe("Pedido de reserva: Carrinho 2 em 05/03/2030 (08:00–09:00)");
    const withoutLink = (text: string) => text.replace(APPROVAL_LINK, "LINK").replace("Carrinho 2", "Carrinho 1");
    expect(withoutLink(batchEmail!.text)).toBe(withoutLink(singleEmail!.text));
    expect(batchEmail!.text).toContain("Um professor pediu um carrinho de Chromebooks. O pedido aguarda a sua aprovação.");
  });

  it("repetir o envio com a mesma Idempotency-Key não duplica o e-mail", async () => {
    const key = randomUUID();
    const slots = threeSlots();

    expect((await postBatch(slots, key)).status).toBe(201);
    await ctx.runBackgroundTasks();
    const replay = await postBatch(slots, key);
    expect(replay.status).toBe(200);
    await ctx.runBackgroundTasks();

    expect(await ctx.db.select().from(notificationOutbox)).toHaveLength(1);
    expect(ctx.emailSender.sent).toHaveLength(1);
  });

  it("falha parcial do envio não gera e-mail", async () => {
    await ctx.db.insert(calendarBlocks).values({ kind: "BLOCK", startDate: NEXT_WEDNESDAY, endDate: NEXT_WEDNESDAY, reason: "Manutenção" });

    const response = await postBatch(threeSlots());
    expect(response.status).toBe(422);
    await ctx.runBackgroundTasks();

    expect(await ctx.db.select().from(notificationOutbox)).toHaveLength(0);
    expect(ctx.emailSender.sent).toHaveLength(0);
  });

  it("e-mail agrupado que falhou aparece uma vez no painel e pode ser reenviado enquanto algum horário aguarda aprovação", async () => {
    ctx.emailSender.failure = new Error("Resend respondeu 503");
    const ids = await createdIds(await postBatch(threeSlots()));
    await ctx.runBackgroundTasks();
    await ctx.client`update app.notification_outbox set status = 'FAILED', attempts = max_attempts`;
    ctx.emailSender.failure = null;

    const [item, ...others] = await failedList();
    expect(others).toHaveLength(0);
    expect(item).toMatchObject({ slotCount: 3, canRetry: true, reservation: { id: ids[0], status: "PENDING" } });

    expect((await cancelReservationRequest(admin, ids[0]!, "Teste")).status).toBe(200);
    const [afterFirstCancel] = await failedList();
    expect(afterFirstCancel).toMatchObject({ canRetry: true, reservation: { status: "CANCELLED" } });

    expect((await retry(item!.id)).status).toBe(202);
    await ctx.runBackgroundTasks();

    expect(ctx.emailSender.sent).toHaveLength(1);
    expect(ctx.emailSender.sent[0]!.subject).toBe("Novo pedido de reserva: 3 horários");
    expect(await failedList()).toEqual([]);
    expect((await retry(item!.id)).status).toBe(409);
  });

  it("não reenvia o e-mail agrupado quando nenhum horário aguarda mais aprovação", async () => {
    ctx.emailSender.failure = new Error("Resend respondeu 503");
    const ids = await createdIds(await postBatch(threeSlots()));
    await ctx.runBackgroundTasks();
    await ctx.client`update app.notification_outbox set status = 'FAILED', attempts = max_attempts`;
    ctx.emailSender.failure = null;

    for (const id of ids) expect((await cancelReservationRequest(admin, id, "Teste")).status).toBe(200);

    const [item] = await failedList();
    expect(item!.canRetry).toBe(false);
    const response = await retry(item!.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "NOTIFICATION_NOT_RETRYABLE" });
  });

  it("mantém no painel o e-mail agrupado enquanto algum horário ainda não passou", async () => {
    ctx.emailSender.failure = new Error("Resend respondeu 503");
    await postBatch([
      slot({ cartId: cart1, startTime: "08:00", endTime: "09:00" }),
      slot({ cartId: cart1, date: NEXT_WEDNESDAY, startTime: "08:00", endTime: "09:00" }),
    ]);
    await ctx.runBackgroundTasks();
    await ctx.client`update app.notification_outbox set status = 'FAILED', attempts = max_attempts`;

    ctx.clock.set("2030-03-06T00:00:00Z");
    expect(await failedList()).toHaveLength(1);
    ctx.clock.set("2030-03-07T12:00:00Z");
    expect(await failedList()).toEqual([]);
  });
});
