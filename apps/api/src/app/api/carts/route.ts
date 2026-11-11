import { getContainer } from "@/lib/container";
import { authorizePublicAccess } from "@/lib/auth/authenticate";
import { json } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { listCarts } from "@/modules/carts/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const container = getContainer();
  await authorizePublicAccess(request, container);
  return json(await listCarts(container, { onlyActive: true }));
});
