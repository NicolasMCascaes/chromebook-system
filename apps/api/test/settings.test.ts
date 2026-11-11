import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CalendarDto, ReservationDto, SchoolSettingsDto, SchoolSettingsMutationDto } from "@chromebook/shared";
import * as settingsRoute from "@/app/api/admin/settings/route";
import * as calendarRoute from "@/app/api/calendar/route";
import { createTestContext, TEST_ACCESS_CODE, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";
import { createTeacher, NEXT_TUESDAY, postReservation, seedCarts } from "./helpers/reservations";

const DEFAULT_SCHEDULES = [
  {
    name: "Manhã",
    periods: [
      { name: "1ª aula", startTime: "07:20", endTime: "08:10" },
      { name: "2ª aula", startTime: "08:10", endTime: "09:00" },
    ],
  },
];

const singleSchedule = (periods: { name: string; startTime: string; endTime: string }[]) => [{ name: "Manhã", periods }];

describe("configurações da escola", () => {
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

  const save = (body: unknown, token = admin.token) =>
    settingsRoute.PUT(apiRequest("/api/admin/settings", { method: "PUT", token, body }), params());

  const validInput = (overrides: Record<string, unknown> = {}) => ({
    openingTime: "07:00",
    closingTime: "12:00",
    slotMinutes: 10,
    notificationEmails: ["coordenacao@escola.test"],
    schedules: DEFAULT_SCHEDULES,
    ...overrides,
  });

  it("lê as configurações atuais com as aulas", async () => {
    const response = await settingsRoute.GET(apiRequest("/api/admin/settings", { token: admin.token }), params());
    expect(response.status).toBe(200);
    const body = (await response.json()) as SchoolSettingsDto;
    expect(body).toMatchObject({ openingTime: "07:00", closingTime: "18:00", slotMinutes: 5, notificationEmails: [] });
    expect(body.schedules.map((schedule) => `${schedule.name}: ${schedule.periods.length}`)).toEqual([
      "6º A, 6º B e 7º ano: 5",
      "Demais turmas: 5",
    ]);
    expect(body.publicAccessCode).toBe(TEST_ACCESS_CODE);
  });

  it("salva horário, e-mails e aulas, e a agenda passa a usá-los", async () => {
    const response = await save(validInput({ notificationEmails: [" Coordenacao@Escola.test "] }));
    expect(response.status).toBe(200);
    const { settings } = (await response.json()) as SchoolSettingsMutationDto;
    expect(settings).toMatchObject({ closingTime: "12:00", slotMinutes: 10, notificationEmails: ["coordenacao@escola.test"] });
    expect(settings.schedules.map((schedule) => schedule.name)).toEqual(["Manhã"]);
    expect(settings.schedules[0]!.periods.map((period) => period.name)).toEqual(["1ª aula", "2ª aula"]);

    const calendar = (await (
      await calendarRoute.GET(apiRequest(`/api/calendar?from=${NEXT_TUESDAY}&to=${NEXT_TUESDAY}`), params())
    ).json()) as CalendarDto;
    expect(calendar.hours).toEqual({ openingTime: "07:00", closingTime: "12:00", slotMinutes: 10 });
    expect(calendar.schedules[0]!.periods).toHaveLength(2);

    const outside = await postReservation(createTeacher(), { cartId: cart1, startTime: "13:00", endTime: "14:00" });
    expect(outside.status).toBe(422);
  });

  it("lista reservas futuras que ficaram fora do novo horário sem cancelá-las", async () => {
    const late = (await (await postReservation(createTeacher(), { cartId: cart1, startTime: "14:00", endTime: "15:00" })).json()) as ReservationDto;
    const misaligned = (await (await postReservation(createTeacher(), { cartId: cart1, startTime: "08:05", endTime: "09:00" })).json()) as ReservationDto;
    await postReservation(createTeacher(), { cartId: cart1, startTime: "10:00", endTime: "11:00" });

    const { affectedReservations } = (await (await save(validInput())).json()) as SchoolSettingsMutationDto;
    expect(affectedReservations.map((item) => item.id).sort()).toEqual([late.id, misaligned.id].sort());
    const [row] = await ctx.client<{ status: string }[]>`select status from app.reservations where id = ${late.id}`;
    expect(row?.status).toBe("CONFIRMED");
  });

  it("valida horário, intervalo, aulas e e-mails", async () => {
    const expectInvalid = async (overrides: Record<string, unknown>) => {
      const response = await save(validInput(overrides));
      expect(response.status).toBe(422);
    };
    await expectInvalid({ closingTime: "06:00" });
    await expectInvalid({ slotMinutes: 7 });
    await expectInvalid({ openingTime: "07:05" });
    await expectInvalid({ schedules: singleSchedule([{ name: "1ª aula", startTime: "06:00", endTime: "07:00" }]) });
    await expectInvalid({ schedules: singleSchedule([{ name: "1ª aula", startTime: "07:20", endTime: "08:15" }]) });
    await expectInvalid({
      schedules: singleSchedule([
        { name: "1ª aula", startTime: "07:20", endTime: "08:10" },
        { name: "2ª aula", startTime: "08:00", endTime: "09:00" },
      ]),
    });
    await expectInvalid({ schedules: [...DEFAULT_SCHEDULES, { name: "manhã", periods: [] }] });
    await expectInvalid({ notificationEmails: ["não é e-mail"] });
    await expectInvalid({ notificationEmails: ["a@escola.test", "A@escola.test"] });
  });

  it("aceita escola sem grades cadastradas", async () => {
    const response = await save(validInput({ schedules: [] }));
    expect(response.status).toBe(200);
    expect(((await response.json()) as SchoolSettingsMutationDto).settings.schedules).toEqual([]);
  });

  it("permite o mesmo horário de aula em grades diferentes", async () => {
    const period = { name: "1ª aula", startTime: "07:20", endTime: "08:10" };
    const response = await save(validInput({ schedules: [{ name: "Grade A", periods: [period] }, { name: "Grade B", periods: [period] }] }));
    expect(response.status).toBe(200);
  });

  it("exige administrador", async () => {
    const professor = await ctx.createUser("PROFESSOR");
    expect((await save(validInput(), professor.token)).status).toBe(403);
  });
});
