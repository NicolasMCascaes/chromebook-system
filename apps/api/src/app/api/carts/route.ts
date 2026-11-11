import { getContainer } from "@/lib/container";
import { json } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { listCarts } from "@/modules/carts/service";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  return json(await listCarts(getContainer(), { onlyActive: true }));
});
