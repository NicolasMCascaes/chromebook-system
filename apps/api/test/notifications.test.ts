import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import * as dispatchRoute from "@/app/api/internal/notifications/dispatch/route";
import { createTestContext, TEST_CRON_SECRET, type TestContext } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import { createTeacher, postReservation, seedCarts } from "./helpers/reservations";

interface OutboxRow {
  recipient: string;
  status: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
}

describe("e-mail de nova reserva", () => {
  let ctx: TestContext;
  let cart1: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    ({ cart1 } = await seedCarts(ctx));
    await ctx.client`update app.school_settings set notification_emails = ${["coord@escola.test", "direcao@escola.test"]}`;
  });

  afterAll(() => ctx.close());

  const outbox = () =>
    ctx.client<OutboxRow[]>`select recipient, status, attempts, last_error, next_attempt_at from app.notification_outbox order by recipient`;

  const teacher = createTeacher("Ana Souza");
  const reserve = (key: string = randomUUID()) =>
    postReservation(teacher, { cartId: cart1, startTime: "08:00", endTime: "09:00", notes: "Pesquisa" }, key);

  const dispatch = (secret: string | null = TEST_CRON_SECRET) =>
    dispatchRoute.POST(
      apiRequest("/api/internal/notifications/dispatch", {
        method: "POST",
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      }),
      params(),
    );

  it("grava um e-mail por destinatário na mesma transação e envia depois da resposta", async () => {
    expect((await reserve()).status).toBe(201);
    expect((await outbox()).map((row) => row.status)).toEqual(["PENDING", "PENDING"]);
    expect(ctx.emailSender.sent).toHaveLength(0);

    await ctx.runBackgroundTasks();

    expect((await outbox()).map((row) => row.status)).toEqual(["SENT", "SENT"]);
    expect(ctx.emailSender.sent.map((message) => message.to).sort()).toEqual(["coord@escola.test", "direcao@escola.test"]);
    const [message] = ctx.emailSender.sent;
    expect(message?.subject).toBe("Nova reserva: Carrinho 1 em 05/03/2030 (08:00–09:00)");
    expect(message?.text).toContain("Professor: Ana Souza");
    expect(message?.text).toContain("Observação: Pesquisa");
    expect(message?.text).toContain("Agenda: http://escola.test");
  });

  it("não enfileira de novo quando a mesma requisição é repetida", async () => {
    const key = randomUUID();
    expect((await reserve(key)).status).toBe(201);
    expect((await reserve(key)).status).toBe(200);
    expect(await outbox()).toHaveLength(2);
  });

  it("sem destinatários cadastrados, a reserva é confirmada sem e-mail", async () => {
    await ctx.client`update app.school_settings set notification_emails = '{}'`;
    expect((await reserve()).status).toBe(201);
    expect(await outbox()).toHaveLength(0);
  });

  it("mantém a reserva quando o envio falha e reagenda com espera crescente até marcar como falha", async () => {
    ctx.emailSender.failure = new Error("Resend respondeu 503");
    expect((await reserve()).status).toBe(201);
    await ctx.runBackgroundTasks();

    const [first] = await outbox();
    expect(first).toMatchObject({ status: "PENDING", attempts: 1, last_error: "Resend respondeu 503" });
    expect(new Date(first!.next_attempt_at).getTime()).toBe(ctx.clock.now().getTime() + 2 * 60_000);

    const [reservation] = await ctx.client<{ status: string }[]>`select status from app.reservations`;
    expect(reservation?.status).toBe("CONFIRMED");

    expect(await (await dispatch()).json()).toEqual({ sent: 0, failed: 0 });

    for (let attempt = 2; attempt <= 5; attempt++) {
      ctx.clock.set(new Date(ctx.clock.now().getTime() + 60 * 60_000));
      expect(await (await dispatch()).json()).toEqual({ sent: 0, failed: 2 });
    }
    expect((await outbox()).map((row) => `${row.status}/${row.attempts}`)).toEqual(["FAILED/5", "FAILED/5"]);

    ctx.clock.set(new Date(ctx.clock.now().getTime() + 24 * 60 * 60_000));
    expect(await (await dispatch()).json()).toEqual({ sent: 0, failed: 0 });
  });

  it("reprocessa pendentes pelo endpoint interno", async () => {
    ctx.emailSender.failure = new Error("fora do ar");
    await reserve();
    await ctx.runBackgroundTasks();
    ctx.emailSender.failure = null;
    ctx.clock.set(new Date(ctx.clock.now().getTime() + 10 * 60_000));

    const response = await dispatch();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 2, failed: 0 });
    expect((await outbox()).map((row) => row.status)).toEqual(["SENT", "SENT"]);
  });

  it("protege o endpoint interno com o segredo do cron", async () => {
    expect((await dispatch(null)).status).toBe(401);
    expect((await dispatch("segredo-errado-0123456789abcdefghijklmn")).status).toBe(401);
  });
});
