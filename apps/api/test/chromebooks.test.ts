import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CartDto, ChromebookDto } from "@chromebook/shared";
import * as adminChromebooks from "@/app/api/admin/chromebooks/route";
import * as adminChromebook from "@/app/api/admin/chromebooks/[id]/route";
import * as adminCart from "@/app/api/admin/carts/[id]/route";
import { carts } from "@/lib/db/schema";
import { createTestContext, type TestContext, type TestUser } from "./helpers/context";
import { apiRequest, params } from "./helpers/http";

describe("cadastro de Chromebooks", () => {
  let ctx: TestContext;
  let admin: TestUser;
  let acerId: string;
  let samsungId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
    admin = await ctx.createUser("ADMIN");
    const rows = await ctx.db
      .insert(carts)
      .values([
        { name: "Carrinho 1", color: "#1E88E5", displayOrder: 1 },
        { name: "Carrinho 2", color: "#43A047", displayOrder: 2 },
      ])
      .returning();
    acerId = rows[0]!.id;
    samsungId = rows[1]!.id;
  });

  afterAll(() => ctx.close());

  const createChromebook = (body: Record<string, unknown>) =>
    adminChromebooks.POST(
      apiRequest("/api/admin/chromebooks", {
        method: "POST",
        token: admin.token,
        body: { name: "Chromebook", brandModel: "Acer C733", cartId: acerId, ...body },
      }),
      params(),
    );

  const patchChromebook = (id: string, body: unknown) =>
    adminChromebook.PATCH(
      apiRequest(`/api/admin/chromebooks/${id}`, { method: "PATCH", token: admin.token, body }),
      params({ id }),
    );

  const cartEquipment = async (id: string) => {
    const response = await adminCart.GET(apiRequest(`/api/admin/carts/${id}`, { token: admin.token }), params({ id }));
    return ((await response.json()) as CartDto).equipment;
  };

  it("cria Chromebook com identificação normalizada e situação padrão", async () => {
    const response = await createChromebook({ assetTag: " acer-01 " });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      assetTag: "ACER-01",
      status: "AVAILABLE",
      cartId: acerId,
      cartName: "Carrinho 1",
    });
  });

  it("recusa identificação duplicada com 409", async () => {
    await createChromebook({ assetTag: "ACER-01" });

    const response = await createChromebook({ assetTag: "acer-01", cartId: samsungId });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: "Já existe um Chromebook com essa identificação." });
  });

  it("recusa carrinho inexistente com 422", async () => {
    const response = await createChromebook({ assetTag: "X-1", cartId: crypto.randomUUID() });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ details: [{ path: "cartId" }] });
  });

  it("recusa situação inválida com 422", async () => {
    expect((await createChromebook({ assetTag: "X-1", status: "QUEBRADO" })).status).toBe(422);
  });

  it("alteração de situação e de carrinho reflete na contagem operacional", async () => {
    const created = (await (await createChromebook({ assetTag: "ACER-01" })).json()) as ChromebookDto;
    expect(await cartEquipment(acerId)).toMatchObject({ total: 1, available: 1 });

    await patchChromebook(created.id, { status: "MAINTENANCE" });
    expect(await cartEquipment(acerId)).toMatchObject({ total: 1, available: 0, maintenance: 1 });

    const moved = await patchChromebook(created.id, { cartId: samsungId, status: "AVAILABLE" });
    expect(await moved.json()).toMatchObject({ cartName: "Carrinho 2", status: "AVAILABLE", assetTag: "ACER-01" });
    expect(await cartEquipment(acerId)).toMatchObject({ total: 0 });
    expect(await cartEquipment(samsungId)).toMatchObject({ total: 1, available: 1 });
  });

  it("filtra por carrinho e situação", async () => {
    await createChromebook({ assetTag: "ACER-01" });
    await createChromebook({ assetTag: "ACER-02", status: "MAINTENANCE" });
    await createChromebook({ assetTag: "SAM-01", cartId: samsungId, brandModel: "Samsung Chromebook 4" });

    const list = async (query: string) => {
      const response = await adminChromebooks.GET(
        apiRequest(`/api/admin/chromebooks${query}`, { token: admin.token }),
        params(),
      );
      return ((await response.json()) as ChromebookDto[]).map((item) => item.assetTag);
    };

    expect(await list("")).toEqual(["ACER-01", "ACER-02", "SAM-01"]);
    expect(await list(`?cartId=${acerId}`)).toEqual(["ACER-01", "ACER-02"]);
    expect(await list(`?cartId=${acerId}&status=MAINTENANCE`)).toEqual(["ACER-02"]);
    const invalid = await adminChromebooks.GET(
      apiRequest("/api/admin/chromebooks?cartId=abc", { token: admin.token }),
      params(),
    );
    expect(invalid.status).toBe(422);
  });
});
