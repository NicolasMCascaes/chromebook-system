import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import type { MeDto } from "@chromebook/shared";
import { getContainer } from "@/lib/container";
import { signDevToken } from "@/lib/auth/dev-auth";
import { users } from "@/lib/db/schema";
import { AppError } from "@/lib/http/errors";
import { json, readJson } from "@/lib/http/responses";
import { route } from "@/lib/http/route";

export const dynamic = "force-dynamic";

const devLoginSchema = z.object({ userId: z.uuid("Usuário inválido.") });

function requireDevAuth(): string {
  const secret = getContainer().devAuthSecret;
  if (!secret) throw AppError.notFound();
  return secret;
}

export const GET = route(async () => {
  requireDevAuth();
  const rows = await getContainer()
    .db.select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.role), asc(users.name));
  const body: MeDto[] = rows;
  return json(body);
});

export const POST = route(async (request) => {
  const secret = requireDevAuth();
  const { userId } = await readJson(request, devLoginSchema);
  const [user] = await getContainer().db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.active) throw AppError.forbidden();
  return json({ accessToken: await signDevToken(secret, user.id) });
});
