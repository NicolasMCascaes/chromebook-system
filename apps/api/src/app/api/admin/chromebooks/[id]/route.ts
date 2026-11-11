import { chromebookUpdateSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseId, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { editChromebook, getChromebook } from "@/modules/chromebooks/service";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  return json(await getChromebook(container, parseId(params.id)));
});

export const PATCH = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  const id = parseId(params.id);
  const input = await readJson(request, chromebookUpdateSchema);
  return json(await editChromebook(container, id, input));
});
