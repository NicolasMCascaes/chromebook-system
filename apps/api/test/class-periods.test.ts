import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "./helpers/context";

const SIXTH_AND_SEVENTH = "6º A, 6º B e 7º ano";
const OTHER_CLASSES = "Demais turmas";

describe("horários de aula", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await ctx.reset();
  });
  afterEach(() => ctx.client`delete from app.class_periods where name like 'Teste%'`);
  afterAll(() => ctx.close());

  const insertPeriod = (schedule: string, name: string, start: string, end: string) =>
    ctx.client`
      insert into app.class_periods (schedule_id, name, start_time, end_time)
      select id, ${name}, ${start}, ${end} from app.class_schedules where name = ${schedule}
    `;

  const periodsOf = async (schedule: string) => {
    const rows = await ctx.client<{ start_time: string; end_time: string }[]>`
      select p.start_time, p.end_time
      from app.class_periods p join app.class_schedules s on s.id = p.schedule_id
      where s.name = ${schedule}
      order by p.start_time
    `;
    return rows.map((row) => `${row.start_time.slice(0, 5)}-${row.end_time.slice(0, 5)}`);
  };

  it("tem duas grades com intervalos diferentes", async () => {
    expect(await periodsOf(SIXTH_AND_SEVENTH)).toEqual(["07:20-08:10", "08:10-09:00", "09:20-10:10", "10:10-11:00", "11:00-11:50"]);
    expect(await periodsOf(OTHER_CLASSES)).toEqual(["07:20-08:10", "08:10-09:00", "09:00-09:50", "10:10-11:00", "11:00-11:50"]);
  });

  it("aceita aula consecutiva e recusa aula sobreposta na mesma grade", async () => {
    await expect(insertPeriod(OTHER_CLASSES, "Teste 6ª aula", "11:50", "12:40")).resolves.toBeDefined();
    await expect(insertPeriod(OTHER_CLASSES, "Teste sobreposta", "11:30", "12:00")).rejects.toMatchObject({
      code: "23P01",
      constraint_name: "class_periods_no_overlap",
    });
  });

  it("permite o mesmo horário em grades diferentes", async () => {
    await expect(insertPeriod(SIXTH_AND_SEVENTH, "Teste 6ª aula", "11:50", "12:40")).resolves.toBeDefined();
    await expect(insertPeriod(OTHER_CLASSES, "Teste 6ª aula", "11:50", "12:40")).resolves.toBeDefined();
  });

  it("recusa aula com término anterior ao início", async () => {
    await expect(insertPeriod(OTHER_CLASSES, "Teste invertida", "14:00", "13:00")).rejects.toMatchObject({
      code: "23514",
      constraint_name: "class_periods_time_order",
    });
  });
});
