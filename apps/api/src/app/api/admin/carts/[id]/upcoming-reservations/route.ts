import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseId } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { listUpcomingCartReservations } from "@/modules/carts/service";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  return json(await listUpcomingCartReservations(container, parseId(params.id)));
});
