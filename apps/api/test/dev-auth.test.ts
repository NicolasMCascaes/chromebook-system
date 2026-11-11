import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as devLoginRoute from "@/app/api/dev/login/route";
import * as meRoute from "@/app/api/me/route";
import { setContainer } from "@/lib/container";
import { createDevTokenVerifier, DevAuthAdminGateway } from "@/lib/auth/dev-auth";
import { readServerEnv } from "@/lib/env";
import { createTestContext, type TestContext } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";

const SECRET = "dev-secret-with-at-least-32-characters";

describe("login de desenvolvimento", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(async () => {
    await ctx.reset();
    setContainer(ctx.container);
  });
  afterAll(() => ctx.close());

  function enableDevAuth() {
    setContainer({
      ...ctx.container,
      tokenVerifier: createDevTokenVerifier(SECRET),
      authAdmin: new DevAuthAdminGateway(ctx.db),
      devAuthSecret: SECRET,
    });
  }

  const listUsers = () => devLoginRoute.GET(apiRequest("/api/dev/login"), params());
  const login = (userId: string) =>
    devLoginRoute.POST(apiRequest("/api/dev/login", { method: "POST", body: { userId } }), params());

  it("não existe quando DEV_AUTH_SECRET não está configurado", async () => {
    const professor = await ctx.createUser("PROFESSOR");
    expect((await listUsers()).status).toBe(404);
    expect((await login(professor.id)).status).toBe(404);
  });

  it("emite token aceito apenas pelo verificador de desenvolvimento", async () => {
    const professor = await ctx.createUser("PROFESSOR");
    enableDevAuth();

    const list = await listUsers();
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([expect.objectContaining({ id: professor.id, role: "PROFESSOR" })]);

    const response = await login(professor.id);
    expect(response.status).toBe(200);
    const { accessToken } = (await response.json()) as { accessToken: string };

    const me = await meRoute.GET(apiRequest("/api/me", { token: accessToken }), params());
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ id: professor.id });

    setContainer(ctx.container);
    const rejected = await meRoute.GET(apiRequest("/api/me", { token: accessToken }), params());
    expect(rejected.status).toBe(401);
  });

  it("recusa usuário inativo", async () => {
    const inactive = await ctx.createUser("PROFESSOR", { active: false });
    enableDevAuth();
    expect((await login(inactive.id)).status).toBe(403);
  });

  it("impede DEV_AUTH_SECRET em produção", () => {
    const env = {
      DATABASE_URL: "postgres://x",
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      DEV_AUTH_SECRET: SECRET,
    };
    expect(() => readServerEnv({ ...env, NODE_ENV: "production" })).toThrow();
    expect(readServerEnv({ ...env, NODE_ENV: "development" }).DEV_AUTH_SECRET).toBe(SECRET);
  });
});
