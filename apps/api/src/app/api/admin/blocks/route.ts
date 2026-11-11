import { blockInputSchema, blockQuerySchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseQuery, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { createBlock, findAffectedReservations, listBlocksOfYear } from "@/modules/blocks/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  const { year } = parseQuery(request, blockQuerySchema);
  return json(await listBlocksOfYear(container, year));
});

export const POST = route(async (request) => {
  const container = getContainer();
  const admin = await authenticateAdmin(request, container);
  const input = await readJson(request, blockInputSchema);
  if (new URL(request.url).searchParams.get("preview") === "true") {
    return json({ block: null, affectedReservations: await findAffectedReservations(container, input) });
  }
  return json(await createBlock(container, admin, input), 201);
});
