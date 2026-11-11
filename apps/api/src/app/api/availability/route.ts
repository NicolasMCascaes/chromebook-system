import { availabilityQuerySchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { json, parseQuery } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { getAvailability } from "@/modules/calendar/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const query = parseQuery(request, availabilityQuerySchema);
  return json(await getAvailability(getContainer(), query));
});
