import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ReservationDto } from "@chromebook/shared";
import { reservations } from "@/lib/db/schema";
import { createTestContext, type TestContext } from "./helpers/context";
import { createTeacher, NEXT_TUESDAY, postReservation, seedCarts, type Teacher } from "./helpers/reservations";

const CONCURRENT_REQUESTS = 8;

describe("concorrência e restrição no banco", () => {
  let ctx: TestContext;
  let cart1: string;
  let cart2: string;
  let teachers: Teacher[];

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    ({ cart1, cart2 } = await seedCarts(ctx));
    teachers = Array.from({ length: CONCURRENT_REQUESTS }, (_, index) => createTeacher(`Professor ${index}`));
  });

  afterAll(() => ctx.close());

  it("reservas simultâneas pelo mesmo horário confirmam exatamente uma", async () => {
    const responses = await Promise.all(
      teachers.map((teacher, index) =>
        postReservation(teacher, {
          cartId: cart1,
          startTime: index % 2 === 0 ? "08:00" : "08:30",
          endTime: "09:30",
        }),
      ),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, ...Array<number>(CONCURRENT_REQUESTS - 1).fill(409)]);
    expect(await ctx.db.select().from(reservations).where(eq(reservations.status, "PENDING"))).toHaveLength(1);
  });

  it("reservas simultâneas em carrinhos diferentes são todas confirmadas", async () => {
    const responses = await Promise.all([
      postReservation(teachers[0]!, { cartId: cart1, startTime: "08:00", endTime: "09:00" }),
      postReservation(teachers[1]!, { cartId: cart2, startTime: "08:00", endTime: "09:00" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
  });

  it("cliques repetidos simultâneos com a mesma chave criam uma única reserva", async () => {
    const key = crypto.randomUUID();
    const teacher = teachers[0]!;

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => postReservation(teacher, { cartId: cart1, startTime: "10:00", endTime: "11:00" }, key)),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 200, 200, 200, 201]);
    const ids = await Promise.all(responses.map(async (response) => ((await response.json()) as ReservationDto).id));
    expect(new Set(ids).size).toBe(1);
    expect(await ctx.db.select().from(reservations)).toHaveLength(1);
  });

  describe("restrição de exclusão aplicada diretamente no PostgreSQL", () => {
    const insertRaw = (teacher: Teacher, cartId: string, start: string, end: string, status = "CONFIRMED") =>
      ctx.client`
        insert into app.reservations
          (cart_id, teacher_name, class_name, reservation_date, start_time, end_time, status, cancelled_at, idempotency_key, request_hash)
        values
          (${cartId}, ${teacher.name}, 'Turma', ${NEXT_TUESDAY}, ${start}, ${end}, ${status},
           case when ${status} = 'CANCELLED' then now() end, gen_random_uuid(), 'raw')
      `;

    it("rejeita sobreposição mesmo sem passar pela API", async () => {
      await insertRaw(teachers[0]!, cart1, "08:00", "09:00");

      await expect(insertRaw(teachers[1]!, cart1, "08:30", "09:30")).rejects.toMatchObject({
        code: "23P01",
        constraint_name: "reservations_no_overlap",
      });
    });

    it("aceita intervalos consecutivos e ignora reservas canceladas", async () => {
      await insertRaw(teachers[0]!, cart1, "08:00", "09:00");
      await insertRaw(teachers[1]!, cart1, "09:00", "10:00");
      await insertRaw(teachers[2]!, cart1, "10:00", "11:00", "CANCELLED");

      await expect(insertRaw(teachers[3]!, cart1, "10:00", "11:00")).resolves.toBeDefined();
    });

    it("impede reativar uma reserva cancelada que conflita com outra", async () => {
      await insertRaw(teachers[0]!, cart1, "08:00", "09:00", "CANCELLED");
      await insertRaw(teachers[1]!, cart1, "08:00", "09:00");

      await expect(
        ctx.client`update app.reservations set status = 'CONFIRMED', cancelled_at = null where status = 'CANCELLED'`,
      ).rejects.toMatchObject({ code: "23P01" });
    });

    it("rejeita término anterior ao início", async () => {
      await expect(insertRaw(teachers[0]!, cart1, "09:00", "08:00")).rejects.toMatchObject({
        code: "23514",
        constraint_name: "reservations_time_order",
      });
    });
  });
});
