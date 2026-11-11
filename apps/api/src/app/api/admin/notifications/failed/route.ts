import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { listUpcomingFailedNotifications } from "@/modules/notifications/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  return json(await listUpcomingFailedNotifications(container));
});
