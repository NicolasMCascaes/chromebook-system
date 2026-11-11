import { getContainer } from "@/lib/container";
import { authenticate } from "@/lib/auth/authenticate";
import { json, parseId } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { getReservation } from "@/modules/reservations/service";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  const user = await authenticate(request, container);
  return json(await getReservation(container, user, parseId(params.id)));
});
