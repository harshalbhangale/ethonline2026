import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolveDirectDatabaseUrl } from "./prisma/database-url";

const migrationUrl = resolveDirectDatabaseUrl();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.ts",
  },
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
