import { parseArgs } from "node:util";
import { userInputSchema } from "@chromebook/shared";
import { createDatabase } from "../src/lib/db/client";
import { users } from "../src/lib/db/schema";
import { readServerEnv } from "../src/lib/env";
import { createSupabaseAdminClient, SupabaseAuthAdminGateway } from "../src/lib/auth/auth-admin";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
  },
});

const parsed = userInputSchema.safeParse({
  email: values.email,
  name: values.name,
  role: "ADMIN",
  password: process.env.ADMIN_PASSWORD,
});
if (!parsed.success) {
  console.error("Uso: ADMIN_PASSWORD='...' npm run create-admin -w @chromebook/api -- --email admin@escola.com --name \"Nome\"");
  for (const issue of parsed.error.issues) console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

const env = readServerEnv();
const { db, client } = createDatabase(env.DATABASE_URL, { max: 1 });

try {
  const gateway = new SupabaseAuthAdminGateway(
    createSupabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    db,
  );
  const authUserId = await gateway.ensureUser(parsed.data.email, parsed.data.password);
  await db
    .insert(users)
    .values({ id: authUserId, email: parsed.data.email, name: parsed.data.name, role: "ADMIN", active: true })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: parsed.data.name, role: "ADMIN", active: true },
    });
  console.log(`Administrador ${parsed.data.email} pronto. Ele já pode entrar com e-mail e senha na área do TI.`);
} finally {
  await client.end();
}
