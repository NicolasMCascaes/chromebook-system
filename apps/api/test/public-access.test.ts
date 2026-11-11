import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolSettingsDto } from "@chromebook/shared";
import * as calendarRoute from "@/app/api/calendar/route";
import * as availabilityRoute from "@/app/api/availability/route";
import * as cartsRoute from "@/app/api/carts/route";
import * as reservationsRoute from "@/app/api/reservations/route";
import * as accessCodeRoute from "@/app/api/admin/settings/access-code/route";
import { createTestContext, TEST_ACCESS_CODE, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import { NEXT_TUESDAY, newCancelToken, seedCarts } from "./helpers/reservations";

describe("link público protegido por código", () => {
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
  });

  afterAll(() => ctx.close());

  const publicGets = (accessCode: string | null, token?: string) => [
    calendarRoute.GET(apiRequest(`/api/calendar?from=${NEXT_TUESDAY}&to=${NEXT_TUESDAY}`, { accessCode, token }), params()),
    availabilityRoute.GET(apiRequest(`/api/availability?date=${NEXT_TUESDAY}`, { accessCode, token }), params()),
    cartsRoute.GET(apiRequest("/api/carts", { accessCode, token }), params()),
  ];

  const postReservation = (accessCode: string | null) =>
    reservationsRoute.POST(
      apiRequest("/api/reservations", {
        method: "POST",
        accessCode,
        headers: { "idempotency-key": crypto.randomUUID() },
        body: {
          teacherName: "Ana",
          className: "7º ano",
          cartId: cart1,
          date: NEXT_TUESDAY,
          startTime: "08:00",
          endTime: "09:00",
          cancelToken: newCancelToken(),
        },
      }),
      params(),
    );

  const regenerate = (token: string) =>
    accessCodeRoute.POST(apiRequest("/api/admin/settings/access-code", { method: "POST", token }), params());

  it("recusa consultas e reservas sem o código ou com código errado", async () => {
    for (const code of [null, "codigo-errado-0000000000"]) {
      for (const response of await Promise.all(publicGets(code))) {
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: "ACCESS_CODE_INVALID" });
      }
      expect((await postReservation(code)).status).toBe(403);
    }
    const [row] = await ctx.client<{ count: string }[]>`select count(*) from app.reservations`;
    expect(Number(row?.count)).toBe(0);
  });

  it("aceita o código correto", async () => {
    for (const response of await Promise.all(publicGets(TEST_ACCESS_CODE))) expect(response.status).toBe(200);
    expect((await postReservation(TEST_ACCESS_CODE)).status).toBe(201);
  });

  it("o TI autenticado acessa sem o código", async () => {
    for (const response of await Promise.all(publicGets(null, admin.token))) expect(response.status).toBe(200);
  });

  it("gerar um novo link invalida o anterior", async () => {
    const response = await regenerate(admin.token);
    expect(response.status).toBe(200);
    const { publicAccessCode } = (await response.json()) as SchoolSettingsDto;
    expect(publicAccessCode).not.toBe(TEST_ACCESS_CODE);
    expect(publicAccessCode).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const [withOldCode] = publicGets(TEST_ACCESS_CODE);
    expect((await withOldCode!).status).toBe(403);
    const [withNewCode] = publicGets(publicAccessCode);
    expect((await withNewCode!).status).toBe(200);
  });

  it("só o TI gera novo link", async () => {
    const professor = await ctx.createUser("PROFESSOR");
    expect((await regenerate(professor.token)).status).toBe(403);
  });
});
