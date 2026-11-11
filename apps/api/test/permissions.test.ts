import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as publicCarts from "@/app/api/carts/route";
import * as adminCarts from "@/app/api/admin/carts/route";
import * as adminCart from "@/app/api/admin/carts/[id]/route";
import * as adminChromebooks from "@/app/api/admin/chromebooks/route";
import * as adminChromebook from "@/app/api/admin/chromebooks/[id]/route";
import * as adminUsers from "@/app/api/admin/users/route";
import * as adminUser from "@/app/api/admin/users/[id]/route";
import { carts, chromebooks, users } from "@/lib/db/schema";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";

describe("permissões de professor e administrador", () => {
  let ctx: TestContext;
  let professor: TestUser;
  let admin: TestUser;
  let cartId: string;
  let chromebookId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    professor = await ctx.createUser("PROFESSOR");
    admin = await ctx.createUser("ADMIN");
    const [cart] = await ctx.db.insert(carts).values({ name: "Carrinho 1", color: "#1E88E5" }).returning();
    cartId = cart!.id;
    const [chromebook] = await ctx.db
      .insert(chromebooks)
      .values({ assetTag: "CB-0", name: "CB 0", brandModel: "Acer", cartId })
      .returning();
    chromebookId = chromebook!.id;
  });

  afterAll(() => ctx.close());

  const adminCalls = (token?: string) => [
    { name: "GET /admin/carts", call: () => adminCarts.GET(apiRequest("/api/admin/carts", { token }), params()) },
    {
      name: "POST /admin/carts",
      call: () =>
        adminCarts.POST(
          apiRequest("/api/admin/carts", { method: "POST", token, body: { name: "Novo", color: "#000000" } }),
          params(),
        ),
    },
    {
      name: "GET /admin/carts/:id",
      call: () => adminCart.GET(apiRequest(`/api/admin/carts/${cartId}`, { token }), params({ id: cartId })),
    },
    {
      name: "PATCH /admin/carts/:id",
      call: () =>
        adminCart.PATCH(
          apiRequest(`/api/admin/carts/${cartId}`, { method: "PATCH", token, body: { active: false } }),
          params({ id: cartId }),
        ),
    },
    {
      name: "GET /admin/chromebooks",
      call: () => adminChromebooks.GET(apiRequest("/api/admin/chromebooks", { token }), params()),
    },
    {
      name: "POST /admin/chromebooks",
      call: () =>
        adminChromebooks.POST(
          apiRequest("/api/admin/chromebooks", {
            method: "POST",
            token,
            body: { assetTag: "CB-1", name: "CB 1", brandModel: "Acer C733", cartId },
          }),
          params(),
        ),
    },
    {
      name: "PATCH /admin/chromebooks/:id",
      call: () =>
        adminChromebook.PATCH(
          apiRequest(`/api/admin/chromebooks/${chromebookId}`, { method: "PATCH", token, body: { status: "MAINTENANCE" } }),
          params({ id: chromebookId }),
        ),
    },
    { name: "GET /admin/users", call: () => adminUsers.GET(apiRequest("/api/admin/users", { token }), params()) },
    {
      name: "POST /admin/users",
      call: () =>
        adminUsers.POST(
          apiRequest("/api/admin/users", { method: "POST", token, body: { email: "novo@escola.test", name: "Novo", password: "senha-segura-123" } }),
          params(),
        ),
    },
    {
      name: "PATCH /admin/users/:id",
      call: () =>
        adminUser.PATCH(
          apiRequest(`/api/admin/users/${professor.id}`, { method: "PATCH", token, body: { role: "ADMIN" } }),
          params({ id: professor.id }),
        ),
    },
  ];

  it("professor recebe 403 em todas as rotas administrativas e nada é alterado", async () => {
    for (const { name, call } of adminCalls(professor.token)) {
      expect((await call()).status, name).toBe(403);
    }

    expect((await ctx.db.select().from(carts)).map((cart) => cart.active)).toEqual([true]);
    expect((await ctx.db.select().from(chromebooks)).map((item) => item.status)).toEqual(["AVAILABLE"]);
    const storedUsers = await ctx.db.select().from(users);
    expect(storedUsers).toHaveLength(2);
    expect(storedUsers.find((user) => user.id === professor.id)?.role).toBe("PROFESSOR");
  });

  it("requisição anônima recebe 401 nas rotas administrativas", async () => {
    for (const { name, call } of adminCalls(undefined)) {
      expect((await call()).status, name).toBe(401);
    }
  });

  it("administrador acessa as rotas administrativas", async () => {
    for (const { name, call } of adminCalls(admin.token)) {
      expect((await call()).status, name).toBeLessThan(300);
    }
  });

  it("a agenda pública lista apenas carrinhos ativos com a quantidade operacional", async () => {
    await ctx.db.insert(carts).values({ name: "Carrinho inativo", color: "#000000", active: false });

    const response = await publicCarts.GET(apiRequest("/api/carts"), params());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { name: string; equipment: { available: number } }[];
    expect(body.map((cart) => cart.name)).toEqual(["Carrinho 1"]);
    expect(body[0]!.equipment.available).toBe(1);
  });
});
