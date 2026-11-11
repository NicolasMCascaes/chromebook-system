import { reservationCancelSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseId, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { cancelReservation } from "@/modules/reservations/service";

export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  const admin = await authenticateAdmin(request, container);
  const id = parseId(params.id);
  const { reason } = await readJson(request, reservationCancelSchema);
  return json(await cancelReservation(container, admin, id, { reason }));
});
