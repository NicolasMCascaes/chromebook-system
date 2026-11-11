import { availabilityQuerySchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticate } from "@/lib/auth/authenticate";
import { json, parseQuery } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { getAvailability } from "@/modules/calendar/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const container = getContainer();
  await authenticate(request, container);
  const query = parseQuery(request, availabilityQuerySchema);
  return json(await getAvailability(container, query));
});
