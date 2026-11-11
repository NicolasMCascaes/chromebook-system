import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const MIGRATIONS_CONFIG = {
  migrationsFolder: path.join(apiRoot, "drizzle"),
  migrationsSchema: "app",
  migrationsTable: "schema_migrations",
} as const;
