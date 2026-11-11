import { reservationCancelSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticate } from "@/lib/auth/authenticate";
import { json, parseId, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { cancelReservation } from "@/modules/reservations/service";

export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  const user = await authenticate(request, container);
  const id = parseId(params.id);
  const { reason } = await readJson(request, reservationCancelSchema);
  return json(await cancelReservation(container, user, id, reason));
});
