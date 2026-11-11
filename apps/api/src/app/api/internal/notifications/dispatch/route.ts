import { timingSafeEqual } from "node:crypto";
import { getContainer } from "@/lib/container";
import { AppError } from "@/lib/http/errors";
import { json } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { dispatchPendingNotifications } from "@/modules/notifications/service";

export const dynamic = "force-dynamic";

function hasValidSecret(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function dispatch(request: Request): Promise<Response> {
  const container = getContainer();
  if (!hasValidSecret(request, container.cronSecret)) throw AppError.unauthorized("Acesso não autorizado.");
  return json(await dispatchPendingNotifications(container));
}

export const GET = route(dispatch);
export const POST = route(dispatch);
