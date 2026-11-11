import { getContainer } from "@/lib/container";
import { authenticateAdmin } from "@/lib/auth/authenticate";
import { json, parseId } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { retryFailedNotification } from "@/modules/notifications/service";

export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (request, params) => {
  const container = getContainer();
  await authenticateAdmin(request, container);
  await retryFailedNotification(container, parseId(params.id));
  return json({ queued: true }, 202);
});
