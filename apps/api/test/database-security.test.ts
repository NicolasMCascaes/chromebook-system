import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "./helpers/context";

const PERMISSION_DENIED = "42501";
const EXPECTED_TABLES = ["calendar_blocks", "carts", "class_periods", "chromebooks", "notification_outbox", "reservations", "school_settings", "users"];

describe("tabelas de negócio fora da API pública do Supabase", () => {
  let ctx: TestContext;
  let tables: string[];

  beforeAll(async () => {
    ctx = await createTestContext();
    const rows = await ctx.client<{ relname: string }[]>`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relkind = 'r'
      order by c.relname
    `;
    tables = rows.map((row) => row.relname);
  });
  afterAll(() => ctx.close());

  const queryAs = (role: "anon" | "authenticated", statement: string) =>
    ctx.client.begin(async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      return tx.unsafe(statement);
    });

  it("o schema contém as tabelas esperadas", () => {
    expect(tables).toEqual(expect.arrayContaining([...EXPECTED_TABLES, "schema_migrations"]));
  });

  it.each(["anon", "authenticated"] as const)("papel %s não lê nem altera nenhuma tabela do schema app", async (role) => {
    for (const table of tables) {
      await expect(queryAs(role, `select * from app.${table}`), `${role}: select ${table}`).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
      await expect(queryAs(role, `delete from app.${table}`), `${role}: delete ${table}`).rejects.toMatchObject({
        code: PERMISSION_DENIED,
      });
    }
  });

  it("todas as tabelas de negócio têm RLS habilitado", async () => {
    const rows = await ctx.client<{ relname: string }[]>`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relkind = 'r' and c.relname <> 'schema_migrations' and not c.relrowsecurity
    `;
    expect(rows).toEqual([]);
  });
});
