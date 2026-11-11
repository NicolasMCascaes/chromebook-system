import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "./helpers/context";

const PERMISSION_DENIED = "42501";

describe("tabelas de negócio fora da API pública do Supabase", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => ctx.close());

  const queryAs = (role: "anon" | "authenticated", statement: string) =>
    ctx.client.begin(async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      return tx.unsafe(statement);
    });

  it.each(["anon", "authenticated"] as const)("papel %s não lê nem altera tabelas do schema app", async (role) => {
    for (const statement of [
      "select * from app.users",
      "select * from app.carts",
      "select * from app.chromebooks",
      "insert into app.carts (name, color) values ('x', '#000000')",
    ]) {
      await expect(queryAs(role, statement), `${role}: ${statement}`).rejects.toMatchObject({ code: PERMISSION_DENIED });
    }
  });

  it("todas as tabelas do schema app têm RLS habilitado", async () => {
    const rows = await ctx.client<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relkind = 'r' and c.relname <> 'schema_migrations'
    `;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.filter((row) => !row.relrowsecurity)).toEqual([]);
  });
});
