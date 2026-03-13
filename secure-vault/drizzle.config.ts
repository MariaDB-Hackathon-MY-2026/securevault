import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

const envLocalPath = path.resolve(".env.local");

if (existsSync(envLocalPath)) {
  const envLocal = readFileSync(envLocalPath, "utf8");

  for (const line of envLocal.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const host = process.env.DATABASE_HOST;
const user = process.env.DATABASE_USER;
const password = process.env.DATABASE_PASSWORD;
const database = process.env.DATABASE_NAME;
const port = Number(process.env.DATABASE_PORT ?? "3306");

if (!host || !user || !password || !database || Number.isNaN(port)) {
  throw new Error("DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, and DATABASE_NAME are required");
}

export default defineConfig({
  dialect: "mysql",
  schema: "./src/lib/db/schema/*",
  out: "./drizzle",
  dbCredentials: {
    host,
    user,
    password,
    database,
    port,
    ssl: {
      rejectUnauthorized: false,
    },
  },
});
