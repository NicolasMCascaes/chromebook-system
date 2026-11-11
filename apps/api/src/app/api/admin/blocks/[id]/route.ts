import { blockInputSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseId, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { editBlock, removeBlock } from "@/modules/blocks/service";

export const dynamic = "force-dynamic";

export const PUT = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  const id = parseId(params.id);
  const input = await readJson(request, blockInputSchema);
  return json(await editBlock(container, id, input));
});

export const DELETE = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  await removeBlock(container, parseId(params.id));
  return new Response(null, { status: 204 });
});
