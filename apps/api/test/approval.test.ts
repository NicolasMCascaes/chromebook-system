import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AdminReservationDto, ReservationDto } from "@chromebook/shared";
import * as approvalRoute from "@/app/api/approvals/[id]/route";
import * as decisionRoute from "@/app/api/admin/reservations/[id]/decision/route";
import { calendarBlocks, carts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import { cancelReservationRequest, createTeacher, NEXT_TUESDAY, postReservation, seedCarts } from "./helpers/reservations";

describe("aprovação de reservas", () => {
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
    await ctx.client`update app.school_settings set notification_emails = ${["ti@escola.test"]}`;
  });

  afterAll(() => ctx.close());

  async function requestReservation(startTime = "08:00", endTime = "09:00") {
    const response = await postReservation(createTeacher("Ana Souza"), { cartId: cart1, startTime, endTime });
    expect(response.status).toBe(201);
    const reservation = (await response.json()) as ReservationDto;
    await ctx.runBackgroundTasks();
    const link = ctx.emailSender.sent.at(-1)!.text.match(/aprovacao\?reserva=([0-9a-f-]+)&codigo=([A-Za-z0-9_-]+)/)!;
    return { reservation, approvalToken: link[2]! };
  }

  const decideByAdmin = (id: string, body: unknown, token = admin.token) =>
    decisionRoute.POST(apiRequest(`/api/admin/reservations/${id}/decision`, { method: "POST", token, body }), params({ id }));

  const decideByLink = (id: string, body: unknown) =>
    approvalRoute.POST(apiRequest(`/api/approvals/${id}`, { method: "POST", body, accessCode: null }), params({ id }));

  const viewByLink = (id: string, approvalToken?: string) =>
    approvalRoute.GET(
      apiRequest(`/api/approvals/${id}`, { accessCode: null, headers: approvalToken ? { "x-approval-token": approvalToken } : {} }),
      params({ id }),
    );

  it("pedido do professor nasce aguardando aprovação e segura o horário", async () => {
    const { reservation } = await requestReservation();
    expect(reservation.status).toBe("PENDING");
    const competing = await postReservation(createTeacher("Bruno"), { cartId: cart1, startTime: "08:30", endTime: "09:30" });
    expect(competing.status).toBe(409);
  });

  it("reserva feita pelo TI logado já nasce aprovada e não gera pedido por e-mail", async () => {
    const response = await postReservation(admin, { cartId: cart1, startTime: "10:00", endTime: "11:00" });
    expect(((await response.json()) as ReservationDto).status).toBe("CONFIRMED");
    await ctx.runBackgroundTasks();
    expect(ctx.emailSender.sent).toHaveLength(0);
  });

  it("o TI aprova pela área administrativa", async () => {
    const { reservation } = await requestReservation();
    const response = await decideByAdmin(reservation.id, { decision: "APPROVE" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "CONFIRMED" });
    const [row] = await ctx.client<{ decided_by: string }[]>`select decided_by from app.reservations where id = ${reservation.id}`;
    expect(row?.decided_by).toBe(admin.id);
  });

  it("recusar registra o motivo e libera o horário", async () => {
    const { reservation } = await requestReservation();
    const response = await decideByAdmin(reservation.id, { decision: "REJECT", reason: "Carrinho reservado para prova" });
    expect(await response.json()).toMatchObject({ status: "REJECTED", decisionReason: "Carrinho reservado para prova", canCancel: false });

    const other = await postReservation(createTeacher("Bruno"), { cartId: cart1, startTime: "08:00", endTime: "09:00" });
    expect(other.status).toBe(201);
  });

  it("o link do e-mail mostra o pedido e permite decidir sem login", async () => {
    const { reservation, approvalToken } = await requestReservation();

    const view = await viewByLink(reservation.id, approvalToken);
    expect(view.status).toBe(200);
    expect((await view.json()) as AdminReservationDto).toMatchObject({ id: reservation.id, status: "PENDING", teacherName: "Ana Souza" });

    const response = await decideByLink(reservation.id, { decision: "APPROVE", approvalToken });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "CONFIRMED" });

    const again = await decideByLink(reservation.id, { decision: "REJECT", approvalToken });
    expect(again.status).toBe(422);
    expect(await again.json()).toMatchObject({ code: "RESERVATION_ALREADY_DECIDED" });
    expect(((await (await viewByLink(reservation.id, approvalToken)).json()) as AdminReservationDto).status).toBe("CONFIRMED");
  });

  it("o código de aprovação fica só no e-mail: o banco guarda o hash e o item enviado perde o código", async () => {
    const { reservation, approvalToken } = await requestReservation();
    const [row] = await ctx.client<{ approval_token_hash: string }[]>`
      select approval_token_hash from app.reservations where id = ${reservation.id}
    `;
    expect(row?.approval_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.approval_token_hash).not.toContain(approvalToken);
    const [outbox] = await ctx.client<{ payload: Record<string, unknown> }[]>`select payload from app.notification_outbox`;
    expect(outbox?.payload).not.toHaveProperty("approvalToken");
  });

  it("recusa link sem código, com código errado ou de outro pedido", async () => {
    const first = await requestReservation("08:00", "09:00");
    const second = await requestReservation("10:00", "11:00");

    expect((await viewByLink(first.reservation.id)).status).toBe(403);
    expect((await viewByLink(first.reservation.id, "x".repeat(43))).status).toBe(403);
    expect((await viewByLink(first.reservation.id, second.approvalToken)).status).toBe(403);
    expect((await decideByLink(first.reservation.id, { decision: "APPROVE", approvalToken: second.approvalToken })).status).toBe(403);
    expect((await decideByLink(first.reservation.id, { decision: "APPROVE" })).status).toBe(403);
  });

  it("avisa quando a data foi bloqueada ou o carrinho desativado depois do pedido", async () => {
    const { reservation } = await requestReservation();
    await ctx.db.insert(calendarBlocks).values({ kind: "BLOCK", startDate: NEXT_TUESDAY, endDate: NEXT_TUESDAY, reason: "Manutenção" });
    const blocked = await decideByAdmin(reservation.id, { decision: "APPROVE" });
    expect(await blocked.json()).toMatchObject({ code: "DATE_BLOCKED" });

    await ctx.client`delete from app.calendar_blocks`;
    await ctx.db.update(carts).set({ active: false }).where(eq(carts.id, cart1));
    const inactive = await decideByAdmin(reservation.id, { decision: "APPROVE" });
    expect(await inactive.json()).toMatchObject({ code: "CART_UNAVAILABLE" });

    expect((await decideByAdmin(reservation.id, { decision: "REJECT" })).status).toBe(200);
  });

  it("pedido cancelado pelo professor não pode mais ser aprovado", async () => {
    const teacher = createTeacher("Ana");
    const created = (await (await postReservation(teacher, { cartId: cart1, startTime: "08:00", endTime: "09:00" })).json()) as ReservationDto;
    expect((await cancelReservationRequest(teacher, created.id)).status).toBe(200);
    expect(await (await decideByAdmin(created.id, { decision: "APPROVE" })).json()).toMatchObject({ code: "RESERVATION_ALREADY_DECIDED" });
  });

  it("só o TI decide pela área administrativa", async () => {
    const { reservation } = await requestReservation();
    const professor = await ctx.createUser("PROFESSOR");
    expect((await decideByAdmin(reservation.id, { decision: "APPROVE" }, professor.token)).status).toBe(403);
  });
});
