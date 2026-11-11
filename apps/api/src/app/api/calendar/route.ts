import { calendarQuerySchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticate } from "@/lib/auth/authenticate";
import { json, parseQuery } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { getCalendar } from "@/modules/calendar/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const container = getContainer();
  const user = await authenticate(request, container);
  const query = parseQuery(request, calendarQuerySchema);
  return json(await getCalendar(container, user, query));
});
