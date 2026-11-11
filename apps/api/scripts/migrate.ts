import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../src/lib/db/client";
import { MIGRATIONS_CONFIG } from "../src/lib/db/migrations";

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Defina DIRECT_DATABASE_URL ou DATABASE_URL para aplicar as migrations.");
  process.exit(1);
}

const { db, client } = createDatabase(connectionString, { max: 1 });
try {
  await migrate(db, MIGRATIONS_CONFIG);
  console.log("Migrations aplicadas com sucesso.");
} finally {
  await client.end();
}
