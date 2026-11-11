import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import * as meRoute from "@/app/api/me/route";
import { createTestContext, TEST_ISSUER, type TestContext } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";

describe("autenticação via token Supabase", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.close());

  const callMe = (token?: string, headers?: Record<string, string>) =>
    meRoute.GET(apiRequest("/api/me", { token, headers }), params());

  it("retorna o usuário autenticado sem campos internos", async () => {
    const professor = await ctx.createUser("PROFESSOR");

    const response = await callMe(professor.token);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: professor.id,
      email: professor.email,
      name: professor.name,
      role: "PROFESSOR",
    });
  });

  it("rejeita requisição sem token com 401", async () => {
    const response = await callMe();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejeita cabeçalho Authorization malformado com 401", async () => {
    expect((await callMe(undefined, { authorization: "Token abc" })).status).toBe(401);
  });

  it("rejeita token assinado por outra chave com 401", async () => {
    const professor = await ctx.createUser("PROFESSOR");
    const { privateKey } = await generateKeyPair("ES256");
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256" })
      .setSubject(professor.id)
      .setIssuer(TEST_ISSUER)
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(privateKey);

    expect((await callMe(forged)).status).toBe(401);
  });

  it("rejeita token com emissor ou audiência incorretos com 401", async () => {
    const professor = await ctx.createUser("PROFESSOR");

    expect((await callMe(await ctx.token(professor.id, { issuer: "http://outro/auth/v1" }))).status).toBe(401);
    expect((await callMe(await ctx.token(professor.id, { audience: "anon" }))).status).toBe(401);
  });

  it("rejeita token expirado com 401", async () => {
    const professor = await ctx.createUser("PROFESSOR");
    const expired = await ctx.token(professor.id, { expiresAt: Math.floor(Date.now() / 1000) - 60 });

    expect((await callMe(expired)).status).toBe(401);
  });

  it("rejeita token válido de e-mail não autorizado com 403", async () => {
    const response = await callMe(await ctx.token(crypto.randomUUID()));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejeita usuário desativado com 403", async () => {
    const professor = await ctx.createUser("PROFESSOR", { active: false });

    expect((await callMe(professor.token)).status).toBe(403);
  });
});
