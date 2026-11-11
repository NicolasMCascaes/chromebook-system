import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export function createDatabase(connectionString: string, options: { max?: number } = {}) {
  const client = postgres(connectionString, {
    prepare: false,
    max: options.max ?? 5,
    max_pipeline: 1,
    query_timeout: 20,
    idle_timeout: 1,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Database = ReturnType<typeof createDatabase>["db"];

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbExecutor = Database | Transaction;
