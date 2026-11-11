import { schoolSettingsInputSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { getSchoolSettings, saveSchoolSettings } from "@/modules/settings/service";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  return json(await getSchoolSettings(container));
});

export const PUT = route(async (request) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  const input = await readJson(request, schoolSettingsInputSchema);
  return json(await saveSchoolSettings(container, input));
});
