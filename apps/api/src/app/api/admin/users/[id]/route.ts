import { userUpdateSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseId, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { updateUserAccess } from "@/modules/users/service";

export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  const actor = await authenticateAdmin(request, container);
  const id = parseId(params.id);
  const input = await readJson(request, userUpdateSchema);
  return json(await updateUserAccess(container, actor, id, input));
});
