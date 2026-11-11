import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FailedNotificationDto, ReservationDto } from "@chromebook/shared";
import * as failedRoute from "@/app/api/admin/notifications/failed/route";
import * as retryRoute from "@/app/api/admin/notifications/[id]/retry/route";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import { cancelReservationRequest, createTeacher, NEXT_TUESDAY, postReservation, seedCarts } from "./helpers/reservations";

describe("e-mails que não foram entregues", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let cart1: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    admin = await ctx.createUser("ADMIN");
    ({ cart1 } = await seedCarts(ctx));
    await ctx.client`update app.school_settings set notification_emails = ${["coord@escola.test", "ti@escola.test"]}`;
  });

  afterAll(() => ctx.close());

  async function failedRequest(): Promise<ReservationDto> {
    ctx.emailSender.failure = new Error("Resend respondeu 503");
    const response = await postReservation(createTeacher("Ana Souza"), { cartId: cart1, startTime: "08:00", endTime: "09:00" });
    const reservation = (await response.json()) as ReservationDto;
    await ctx.runBackgroundTasks();
    await ctx.client`update app.notification_outbox set status = 'FAILED', attempts = max_attempts`;
    ctx.emailSender.failure = null;
    return reservation;
  }

  const listFailed = (token: string | null = admin.token) =>
    failedRoute.GET(apiRequest("/api/admin/notifications/failed", { token: token ?? undefined }), params());

  const retry = (id: string, token: string | null = admin.token) =>
    retryRoute.POST(apiRequest(`/api/admin/notifications/${id}/retry`, { method: "POST", token: token ?? undefined }), params({ id }));

  async function failedList(): Promise<FailedNotificationDto[]> {
    const response = await listFailed();
    expect(response.status).toBe(200);
    return (await response.json()) as FailedNotificationDto[];
  }

  it("lista os e-mails que falharam com os dados do pedido", async () => {
    const reservation = await failedRequest();
    const list = await failedList();
    expect(list.map((item) => item.recipient).sort()).toEqual(["coord@escola.test", "ti@escola.test"]);
    expect(list[0]).toMatchObject({
      attempts: 5,
      lastError: "Resend respondeu 503",
      canRetry: true,
      reservation: {
        id: reservation.id,
        teacherName: "Ana Souza",
        cartName: "Carrinho 1",
        date: NEXT_TUESDAY,
        startTime: "08:00",
        endTime: "09:00",
        status: "PENDING",
      },
    });
  });

  it("só o TI acessa a lista e o reenvio", async () => {
    await failedRequest();
    const [item] = await failedList();
    expect((await listFailed(null)).status).toBe(401);
    expect((await retry(item!.id, null)).status).toBe(401);
    const teacherUser = await ctx.createUser("PROFESSOR");
    expect((await listFailed(teacherUser.token)).status).toBe(403);
  });

  it("reenvia o e-mail com o link de aprovação e tira o item da lista", async () => {
    await failedRequest();
    const [first, second] = await failedList();

    const response = await retry(first!.id);
    expect(response.status).toBe(202);
    await ctx.runBackgroundTasks();

    expect(ctx.emailSender.sent.map((message) => message.to)).toEqual([first!.recipient]);
    expect(ctx.emailSender.sent[0]?.text).toMatch(/aprovacao\?reserva=[0-9a-f-]+&codigo=[A-Za-z0-9_-]{43}/);
    expect((await failedList()).map((item) => item.id)).toEqual([second!.id]);

    expect((await retry(first!.id)).status).toBe(409);
  });

  it("não reenvia quando o pedido já não aguarda aprovação", async () => {
    const reservation = await failedRequest();
    expect((await cancelReservationRequest(admin, reservation.id, "Teste")).status).toBe(200);

    const list = await failedList();
    expect(list.every((item) => !item.canRetry && item.reservation.status === "CANCELLED")).toBe(true);
    const response = await retry(list[0]!.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "NOTIFICATION_NOT_RETRYABLE" });
  });

  it("não mostra falhas de reservas que já passaram", async () => {
    await failedRequest();
    ctx.clock.set("2030-03-06T12:00:00Z");
    expect(await failedList()).toEqual([]);
  });
});
