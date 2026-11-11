import { reservationDecisionSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { json, parseId, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { decideReservation, getReservationForApproval } from "@/modules/reservations/approval-service";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  const id = parseId(params.id);
  return json(await getReservationForApproval(container, id, request.headers.get("x-approval-token") ?? undefined));
});

export const POST = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  const id = parseId(params.id);
  const input = await readJson(request, reservationDecisionSchema);
  return json(await decideReservation(container, null, id, input));
});
