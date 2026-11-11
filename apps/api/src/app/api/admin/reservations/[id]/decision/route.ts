import { reservationDecisionSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseId, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { decideReservation } from "@/modules/reservations/approval-service";

export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  const admin = await authenticateAdmin(request, container);
  const id = parseId(params.id);
  const input = await readJson(request, reservationDecisionSchema);
  return json(await decideReservation(container, admin, id, input));
});
