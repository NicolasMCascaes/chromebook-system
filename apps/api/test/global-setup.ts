import type { TestProject } from "vitest/node";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../src/lib/db/client";
import { MIGRATIONS_CONFIG } from "../src/lib/db/migrations";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const TEST_DATABASE_SUFFIX = "_test";

export async function setup(project: TestProject) {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error("Defina TEST_DATABASE_URL em apps/api/.env.test (veja o README).");
  }

  const { db, client } = createDatabase(connectionString, { max: 1 });
  try {
    const [row] = await client<{ name: string }[]>`select current_database() as name`;
    if (!row?.name.endsWith(TEST_DATABASE_SUFFIX)) {
      throw new Error(`Os testes recriam o schema "app" e só rodam em bancos terminados em "${TEST_DATABASE_SUFFIX}".`);
    }

    await client.unsafe(`
      drop schema if exists app cascade;
      create schema app;
      grant usage on schema app to anon, authenticated;
      alter default privileges in schema app grant all on tables to anon, authenticated;
    `);
    await migrate(db, MIGRATIONS_CONFIG);
  } finally {
    await client.end();
  }

  project.provide("databaseUrl", connectionString);
}
