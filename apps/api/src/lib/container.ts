import { createDatabase, type Database } from "./db/client";
import { readServerEnv, type ServerEnv } from "./env";
import { createSupabaseTokenVerifier, type TokenVerifier } from "./auth/token-verifier";
import { createSupabaseAdminClient, SupabaseAuthAdminGateway, type AuthAdminGateway } from "./auth/auth-admin";
import { createDevTokenVerifier, DevAuthAdminGateway } from "./auth/dev-auth";
import { systemClock, type Clock } from "./clock";
import { after } from "next/server";
import { ConsoleEmailSender, ResendEmailSender, type EmailSender } from "./email/sender";

export interface AppContainer {
  db: Database;
  tokenVerifier: TokenVerifier;
  authAdmin: AuthAdminGateway;
  clock: Clock;
  emailSender: EmailSender;
  runAfterResponse: (task: () => Promise<void>) => void;
  holdUntilConnectionsClose?: () => void;
  cronSecret?: string;
  appPublicUrl?: string;
  devAuthSecret?: string;
}

const CONNECTION_CLOSE_GRACE_MS = 2_000;

const globalForContainer = globalThis as unknown as { appContainer?: AppContainer };

function createEmailSender(env: ServerEnv): EmailSender {
  if (env.EMAIL_PROVIDER === "resend") return new ResendEmailSender(env.RESEND_API_KEY!, env.EMAIL_FROM!);
  return new ConsoleEmailSender();
}

function createDefaultContainer(): AppContainer {
  const env = readServerEnv();
  const { db } = createDatabase(env.DATABASE_URL, { max: 1 });
  const shared = {
    db,
    clock: systemClock,
    emailSender: createEmailSender(env),
    runAfterResponse: (task: () => Promise<void>) => after(task),
    holdUntilConnectionsClose: () => after(() => new Promise<void>((resolve) => setTimeout(resolve, CONNECTION_CLOSE_GRACE_MS))),
    cronSecret: env.CRON_SECRET,
    appPublicUrl: env.APP_PUBLIC_URL,
  };
  if (env.DEV_AUTH_SECRET) {
    return {
      ...shared,
      tokenVerifier: createDevTokenVerifier(env.DEV_AUTH_SECRET),
      authAdmin: new DevAuthAdminGateway(db),
      devAuthSecret: env.DEV_AUTH_SECRET,
    };
  }
  return {
    ...shared,
    tokenVerifier: createSupabaseTokenVerifier(env.SUPABASE_URL),
    authAdmin: new SupabaseAuthAdminGateway(
      createSupabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
      db,
    ),
  };
}

export function getContainer(): AppContainer {
  globalForContainer.appContainer ??= createDefaultContainer();
  return globalForContainer.appContainer;
}

export function setContainer(container: AppContainer | undefined): void {
  globalForContainer.appContainer = container;
}
