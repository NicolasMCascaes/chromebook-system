import { chromebookFilterSchema, chromebookInputSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseQuery, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { createChromebook, listChromebooksForAdmin } from "@/modules/chromebooks/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  const filters = parseQuery(request, chromebookFilterSchema);
  return json(await listChromebooksForAdmin(container, filters));
});

export const POST = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  const input = await readJson(request, chromebookInputSchema);
  return json(await createChromebook(container, input), 201);
});
