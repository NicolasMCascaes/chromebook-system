import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CartDto } from "@chromebook/shared";
import * as adminCarts from "@/app/api/admin/carts/route";
import * as adminCart from "@/app/api/admin/carts/[id]/route";
import { chromebooks } from "@/lib/db/schema";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";

describe("cadastro de carrinhos", () => {
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

  const createCart = (body: unknown) =>
    adminCarts.POST(apiRequest("/api/admin/carts", { method: "POST", token: admin.token, body }), params());

  const createCartDto = async (body: unknown) => (await (await createCart(body)).json()) as CartDto;

  const patchCart = (id: string, body: unknown) =>
    adminCart.PATCH(apiRequest(`/api/admin/carts/${id}`, { method: "PATCH", token: admin.token, body }), params({ id }));

  it("cria carrinho com valores padrão e contagem zerada", async () => {
    const response = await createCart({ name: "  Carrinho 1  ", color: "#1E88E5" });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      name: "Carrinho 1",
      description: null,
      color: "#1E88E5",
      displayOrder: 0,
      active: true,
      equipment: { total: 0, available: 0, maintenance: 0, inactive: 0 },
    });
  });

  it("recusa nome duplicado sem diferenciar maiúsculas com 409", async () => {
    await createCart({ name: "Carrinho Acer", color: "#1E88E5" });

    const response = await createCart({ name: "carrinho acer", color: "#43A047" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: "Já existe um carrinho com esse nome." });
  });

  it("recusa dados inválidos com 422 e detalhes por campo", async () => {
    const response = await createCart({ name: "", color: "azul" });

    expect(response.status).toBe(422);
    const body = (await response.json()) as { details: { path: string }[] };
    expect(body.details.map((detail) => detail.path).sort()).toEqual(["color", "name"]);
  });

  it("recusa JSON malformado com 422", async () => {
    const response = await adminCarts.POST(
      apiRequest("/api/admin/carts", { method: "POST", token: admin.token, rawBody: "{nome" }),
      params(),
    );
    expect(response.status).toBe(422);
  });

  it("atualização parcial não altera os demais campos", async () => {
    const created = await createCartDto({ name: "Carrinho 2", color: "#43A047", displayOrder: 5, active: false });

    const response = await patchCart(created.id, { name: "Carrinho Samsung" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "Carrinho Samsung",
      color: "#43A047",
      displayOrder: 5,
      active: false,
    });
  });

  it("recusa atualização vazia com 422", async () => {
    const created = await createCartDto({ name: "Carrinho 1", color: "#43A047" });
    expect((await patchCart(created.id, {})).status).toBe(422);
  });

  it("recusa renomear para um nome já usado com 409", async () => {
    await createCartDto({ name: "Carrinho 1", color: "#43A047" });
    const second = await createCartDto({ name: "Carrinho 2", color: "#43A047" });

    expect((await patchCart(second.id, { name: "CARRINHO 1" })).status).toBe(409);
  });

  it("retorna 404 para carrinho inexistente ou identificador inválido", async () => {
    expect((await patchCart(crypto.randomUUID(), { active: false })).status).toBe(404);
    expect((await patchCart("nao-e-uuid", { active: false })).status).toBe(404);
  });

  it("resume os equipamentos por situação", async () => {
    const created = await createCartDto({ name: "Carrinho 1", color: "#43A047" });
    await ctx.db.insert(chromebooks).values([
      { assetTag: "A1", name: "A1", brandModel: "Acer", cartId: created.id, status: "AVAILABLE" },
      { assetTag: "A2", name: "A2", brandModel: "Acer", cartId: created.id, status: "AVAILABLE" },
      { assetTag: "A3", name: "A3", brandModel: "Acer", cartId: created.id, status: "MAINTENANCE" },
      { assetTag: "A4", name: "A4", brandModel: "Acer", cartId: created.id, status: "INACTIVE" },
    ]);

    const response = await adminCart.GET(
      apiRequest(`/api/admin/carts/${created.id}`, { token: admin.token }),
      params({ id: created.id }),
    );

    expect(((await response.json()) as CartDto).equipment).toEqual({ total: 4, available: 2, maintenance: 1, inactive: 1 });
  });
});
