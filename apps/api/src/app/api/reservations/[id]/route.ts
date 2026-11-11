import { getContainer } from "@/lib/container";
import { authorizePublicAccess } from "@/lib/auth/authenticate";
import { json, parseId } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { getReservation } from "@/modules/reservations/service";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  const admin = await authorizePublicAccess(request, container);
  const cancelToken = request.headers.get("x-cancel-token") ?? undefined;
  return json(await getReservation(container, admin, parseId(params.id), cancelToken));
});
