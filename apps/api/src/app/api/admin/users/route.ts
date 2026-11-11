import { userInputSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { authorizeUser, listAuthorizedUsers } from "@/modules/users/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  return json(await listAuthorizedUsers(container));
});

export const POST = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  const input = await readJson(request, userInputSchema);
  return json(await authorizeUser(container, input), 201);
});
