import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEV_AUTH_SECRET: z.string().min(32).optional(),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  CRON_SECRET: z.string().min(32).optional(),
  APP_PUBLIC_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function readServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const invalidKeys = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${invalidKeys}`);
  }
  if (result.data.DEV_AUTH_SECRET && source.NODE_ENV === "production") {
    throw new Error("DEV_AUTH_SECRET must not be set in production");
  }
  if (result.data.EMAIL_PROVIDER === "resend" && (!result.data.RESEND_API_KEY || !result.data.EMAIL_FROM)) {
    throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM");
  }
  return result.data;
}

