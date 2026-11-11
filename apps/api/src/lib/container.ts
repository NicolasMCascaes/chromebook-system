import { createDatabase, type Database } from "./db/client";
import { readServerEnv } from "./env";
import { createSupabaseTokenVerifier, type TokenVerifier } from "./auth/token-verifier";
import { createSupabaseAdminClient, SupabaseAuthAdminGateway, type AuthAdminGateway } from "./auth/auth-admin";
import { createDevTokenVerifier, DevAuthAdminGateway } from "./auth/dev-auth";
import { systemClock, type Clock } from "./clock";

export interface AppContainer {
  db: Database;
  tokenVerifier: TokenVerifier;
  authAdmin: AuthAdminGateway;
  clock: Clock;
  devAuthSecret?: string;
}

const globalForContainer = globalThis as unknown as { appContainer?: AppContainer };

function createDefaultContainer(): AppContainer {
  const env = readServerEnv();
  const { db } = createDatabase(env.DATABASE_URL);
  if (env.DEV_AUTH_SECRET) {
    return {
      db,
      tokenVerifier: createDevTokenVerifier(env.DEV_AUTH_SECRET),
      authAdmin: new DevAuthAdminGateway(db),
      clock: systemClock,
      devAuthSecret: env.DEV_AUTH_SECRET,
    };
  }
  return {
    db,
    tokenVerifier: createSupabaseTokenVerifier(env.SUPABASE_URL),
    authAdmin: new SupabaseAuthAdminGateway(
      createSupabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
      db,
    ),
    clock: systemClock,
  };
}

export function getContainer(): AppContainer {
  globalForContainer.appContainer ??= createDefaultContainer();
  return globalForContainer.appContainer;
}

export function setContainer(container: AppContainer | undefined): void {
  globalForContainer.appContainer = container;
}
