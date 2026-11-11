import { adminReservationQuerySchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseQuery } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { listAdminReservations } from "@/modules/reservations/admin-service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  return json(await listAdminReservations(container, parseQuery(request, adminReservationQuerySchema)));
});
