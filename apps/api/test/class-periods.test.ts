import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "./helpers/context";

describe("horários de aula", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterEach(() => ctx.client`delete from app.class_periods where name like 'Teste%'`);
  afterAll(() => ctx.close());

  const insertPeriod = (name: string, start: string, end: string) =>
    ctx.client`insert into app.class_periods (name, start_time, end_time) values (${name}, ${start}, ${end})`;

  it("vem configurado com as cinco aulas padrão da manhã", async () => {
    const rows = await ctx.client<{ name: string; start_time: string; end_time: string }[]>`
      select name, start_time, end_time from app.class_periods order by start_time
    `;
    expect(rows.map((row) => `${row.start_time.slice(0, 5)}-${row.end_time.slice(0, 5)}`)).toEqual([
      "07:20-08:10",
      "08:10-09:00",
      "09:00-09:50",
      "10:10-11:00",
      "11:00-11:50",
    ]);
  });

  it("aceita aula consecutiva e recusa aula sobreposta no banco", async () => {
    await expect(insertPeriod("Teste 6ª aula", "11:50", "12:40")).resolves.toBeDefined();
    await expect(insertPeriod("Teste sobreposta", "11:30", "12:00")).rejects.toMatchObject({
      code: "23P01",
      constraint_name: "class_periods_no_overlap",
    });
  });

  it("recusa aula com término anterior ao início", async () => {
    await expect(insertPeriod("Teste invertida", "14:00", "13:00")).rejects.toMatchObject({
      code: "23514",
      constraint_name: "class_periods_time_order",
    });
  });
});
