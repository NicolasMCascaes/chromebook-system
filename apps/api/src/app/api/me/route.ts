import type { MeDto } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { authenticate } from "@/lib/auth/authenticate";
import { json } from "@/lib/http/responses";
import { route } from "@/lib/http/route";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const user = await authenticate(request, getContainer());
  const body: MeDto = { id: user.id, email: user.email, name: user.name, role: user.role };
  return json(body);
});
