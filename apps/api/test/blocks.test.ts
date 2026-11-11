import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BlockDto, BlockMutationDto, ReservationDto } from "@chromebook/shared";
import * as blocksRoute from "@/app/api/admin/blocks/route";
import * as blockRoute from "@/app/api/admin/blocks/[id]/route";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import { createTeacher, NEXT_TUESDAY, postReservation, seedCarts, TODAY } from "./helpers/reservations";

describe("bloqueios e feriados", () => {
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

  const post = (body: unknown, query = "", token = admin.token) =>
    blocksRoute.POST(apiRequest(`/api/admin/blocks${query}`, { method: "POST", token, body }), params());

  const put = (id: string, body: unknown) =>
    blockRoute.PUT(apiRequest(`/api/admin/blocks/${id}`, { method: "PUT", token: admin.token, body }), params({ id }));

  const remove = (id: string) =>
    blockRoute.DELETE(apiRequest(`/api/admin/blocks/${id}`, { method: "DELETE", token: admin.token }), params({ id }));

  const listYear = async (year: number) =>
    (await (await blocksRoute.GET(apiRequest(`/api/admin/blocks?year=${year}`, { token: admin.token }), params())).json()) as BlockDto[];

  const reserve = async (cartId: string, date: string, startTime: string, endTime: string) => {
    const response = await postReservation(createTeacher("Ana"), { cartId, date, startTime, endTime });
    expect(response.status).toBe(201);
    return (await response.json()) as ReservationDto;
  };

  it("cria feriado, lista por ano e impede novas reservas na data", async () => {
    const response = await post({ kind: "HOLIDAY_MUNICIPAL", startDate: "2030-03-06", endDate: "2030-03-06", reason: "Aniversário da cidade" });
    expect(response.status).toBe(201);
    const { block } = (await response.json()) as BlockMutationDto;
    expect(block).toMatchObject({ kind: "HOLIDAY_MUNICIPAL", cartId: null, cartName: null });

    expect((await listYear(2030)).map((item) => item.reason)).toEqual(["Aniversário da cidade"]);
    expect(await listYear(2031)).toEqual([]);

    const blocked = await postReservation(createTeacher(), { cartId: cart1, date: "2030-03-06", startTime: "08:00", endTime: "09:00" });
    expect(blocked.status).toBe(422);
  });

  it("mostra a prévia das reservas afetadas sem salvar e devolve as mesmas reservas ao salvar", async () => {
    const affected = await reserve(cart1, NEXT_TUESDAY, "08:00", "09:00");
    await reserve(cart2, NEXT_TUESDAY, "08:00", "09:00");
    const pastToday = await reserve(cart1, TODAY, "10:30", "11:00");
    ctx.clock.set("2030-03-04T13:45:00Z");

    const input = { kind: "BLOCK", startDate: TODAY, endDate: NEXT_TUESDAY, reason: "Manutenção", cartId: cart1 };
    const preview = await post(input, "?preview=true");
    expect(preview.status).toBe(200);
    const previewBody = (await preview.json()) as BlockMutationDto;
    expect(previewBody.block).toBeNull();
    expect(previewBody.affectedReservations.map((item) => item.id)).toEqual([affected.id]);
    expect(await listYear(2030)).toEqual([]);

    const saved = (await (await post(input)).json()) as BlockMutationDto;
    expect(saved.block).toMatchObject({ cartId: cart1, cartName: "Carrinho 1" });
    expect(saved.affectedReservations.map((item) => item.id)).toEqual([affected.id]);
    expect(saved.affectedReservations.map((item) => item.id)).not.toContain(pastToday.id);
  });

  it("não cancela automaticamente as reservas afetadas", async () => {
    const affected = await reserve(cart1, NEXT_TUESDAY, "08:00", "09:00");
    await post({ kind: "SCHOOL_RECESS", startDate: NEXT_TUESDAY, endDate: NEXT_TUESDAY, reason: "Recesso" });
    const [row] = await ctx.client<{ status: string }[]>`select status from app.reservations where id = ${affected.id}`;
    expect(row?.status).toBe("PENDING");
  });

  it("edita e exclui bloqueio", async () => {
    const { block } = (await (await post({ kind: "BLOCK", startDate: NEXT_TUESDAY, endDate: NEXT_TUESDAY, reason: "Prova", cartId: cart2 })).json()) as BlockMutationDto;

    const edited = await put(block!.id, { kind: "BLOCK", startDate: NEXT_TUESDAY, endDate: "2030-03-07", reason: "Prova bimestral", cartId: cart2 });
    expect(edited.status).toBe(200);
    expect(((await edited.json()) as BlockMutationDto).block).toMatchObject({ endDate: "2030-03-07", reason: "Prova bimestral" });

    expect((await remove(block!.id)).status).toBe(204);
    expect((await remove(block!.id)).status).toBe(404);
    expect(await listYear(2030)).toEqual([]);
  });

  it("valida os dados", async () => {
    const expectInvalid = async (body: unknown) => expect((await post(body)).status).toBe(422);
    await expectInvalid({ kind: "BLOCK", startDate: "2030-03-07", endDate: "2030-03-06", reason: "x" });
    await expectInvalid({ kind: "HOLIDAY_NATIONAL", startDate: "2030-03-06", endDate: "2030-03-06", reason: "x", cartId: cart1 });
    await expectInvalid({ kind: "BLOCK", startDate: "2030-03-06", endDate: "2030-03-06", reason: " " });
    await expectInvalid({ kind: "OUTRO", startDate: "2030-03-06", endDate: "2030-03-06", reason: "x" });
    await expectInvalid({ kind: "BLOCK", startDate: "2030-03-06", endDate: "2030-03-06", reason: "x", cartId: "00000000-0000-4000-8000-000000000000" });
  });

  it("exige administrador", async () => {
    const professor = await ctx.createUser("PROFESSOR");
    const response = await post({ kind: "BLOCK", startDate: "2030-03-06", endDate: "2030-03-06", reason: "x" }, "", professor.token);
    expect(response.status).toBe(403);
  });
});
