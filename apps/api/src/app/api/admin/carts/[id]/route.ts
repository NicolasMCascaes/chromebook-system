import { cartUpdateSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseId, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { editCart, getCart } from "@/modules/carts/service";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  return json(await getCart(container, parseId(params.id)));
});

export const PATCH = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  const id = parseId(params.id);
  const input = await readJson(request, cartUpdateSchema);
  return json(await editCart(container, id, input));
});
