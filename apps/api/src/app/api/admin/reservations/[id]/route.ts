import { reservationUpdateSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseId, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { editReservation } from "@/modules/reservations/admin-service";

export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  const id = parseId(params.id);
  const input = await readJson(request, reservationUpdateSchema);
  return json(await editReservation(container, id, input));
});
