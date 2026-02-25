import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const databaseUrl = process.env.DATABASE_URL;
const isSqlite =
  databaseUrl.startsWith("sqlite:") || databaseUrl.startsWith("file:");

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: isSqlite ? "sqlite" : "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  ...(isSqlite ? { driver: "better-sqlite3" } : {}),
});
