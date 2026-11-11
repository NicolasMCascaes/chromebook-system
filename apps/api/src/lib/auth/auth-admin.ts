import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

export interface AuthAdminGateway {
  ensureUser(email: string): Promise<string>;
}

export class SupabaseAuthAdminGateway implements AuthAdminGateway {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly db: Database,
  ) {}

  async ensureUser(email: string): Promise<string> {
    const { data, error } = await this.supabase.auth.admin.createUser({ email, email_confirm: true });
    if (data.user) return data.user.id;
    if (error?.code === "email_exists") {
      const rows = await this.db.execute<{ id: string }>(
        sql`select id from auth.users where lower(email) = ${email} limit 1`,
      );
      const existing = rows[0];
      if (existing) return existing.id;
    }
    throw new Error(`Supabase Auth user provisioning failed: ${error?.code ?? "unknown"}`);
  }
}

export function createSupabaseAdminClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
