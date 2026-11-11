import { cartInputSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { createCart, listCarts } from "@/modules/carts/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  return json(await listCarts(container, { onlyActive: false }));
});

export const POST = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  const input = await readJson(request, cartInputSchema);
  return json(await createCart(container, input), 201);
});
