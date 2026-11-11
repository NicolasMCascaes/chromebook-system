import { z } from "zod";
import { reservationInputSchema } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticateAdminIfPresent } from "@/lib/auth/authenticate";
import { AppError } from "@/lib/http/errors";
import { json, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";
import { createReservation } from "@/modules/reservations/service";

export const dynamic = "force-dynamic";

const idempotencyKeySchema = z.uuid();

function readIdempotencyKey(request: Request): string {
  const parsed = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!parsed.success) {
    throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Cabeçalho Idempotency-Key ausente ou inválido.");
  }
  return parsed.data;
}

export const POST = route(async (request) => {
  const container = getContainer();
  const admin = await authenticateAdminIfPresent(request, container);
  const idempotencyKey = readIdempotencyKey(request);
  const input = await readJson(request, reservationInputSchema);
  const { reservation, replayed } = await createReservation(container, admin, input, idempotencyKey);
  return json(reservation, replayed ? 200 : 201);
});
