import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { UserDto } from "@chromebook/shared";
import * as adminUsers from "@/app/api/admin/users/route";
import * as adminUser from "@/app/api/admin/users/[id]/route";
import * as meRoute from "@/app/api/me/route";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";

describe("autorização de e-mails pelo administrador", () => {
  let ctx: TestContext;
  let admin: TestUser;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    admin = await ctx.createUser("ADMIN");
  });

  afterAll(() => ctx.close());

  const authorize = (body: unknown) =>
    adminUsers.POST(apiRequest("/api/admin/users", { method: "POST", token: admin.token, body }), params());

  const patchUser = (id: string, body: unknown) =>
    adminUser.PATCH(apiRequest(`/api/admin/users/${id}`, { method: "PATCH", token: admin.token, body }), params({ id }));

  it("autoriza e-mail normalizado como professor e provisiona a conta no Supabase Auth", async () => {
    const response = await authorize({ email: "  Maria.Silva@Escola.Test ", name: "Maria Silva" });

    expect(response.status).toBe(201);
    const user = (await response.json()) as UserDto;
    expect(user).toMatchObject({ email: "maria.silva@escola.test", role: "PROFESSOR", active: true });
    expect(ctx.authAdmin.idsByEmail.get("maria.silva@escola.test")).toBe(user.id);
  });

  it("o usuário autorizado consegue acessar com o token do Supabase", async () => {
    const user = (await (await authorize({ email: "joao@escola.test", name: "João" })).json()) as UserDto;

    const response = await meRoute.GET(apiRequest("/api/me", { token: await ctx.token(user.id) }), params());

    expect(response.status).toBe(200);
  });

  it("recusa e-mail já autorizado com 409", async () => {
    await authorize({ email: "joao@escola.test", name: "João" });

    expect((await authorize({ email: "JOAO@escola.test", name: "Outro" })).status).toBe(409);
  });

  it("recusa e-mail inválido com 422", async () => {
    expect((await authorize({ email: "joao", name: "João" })).status).toBe(422);
  });

  it("desativar um professor bloqueia o acesso dele", async () => {
    const professor = await ctx.createUser("PROFESSOR");

    const response = await patchUser(professor.id, { active: false });

    expect(response.status).toBe(200);
    expect((await meRoute.GET(apiRequest("/api/me", { token: professor.token }), params())).status).toBe(403);
  });

  it("administrador não pode remover o próprio acesso", async () => {
    expect((await patchUser(admin.id, { active: false })).status).toBe(422);
    expect((await patchUser(admin.id, { role: "PROFESSOR" })).status).toBe(422);
    expect((await patchUser(admin.id, { name: "Novo Nome" })).status).toBe(200);
  });

  it("retorna 404 ao editar usuário inexistente", async () => {
    expect((await patchUser(crypto.randomUUID(), { active: false })).status).toBe(404);
  });
});
