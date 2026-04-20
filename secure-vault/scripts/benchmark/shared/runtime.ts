import { readFile } from "node:fs/promises";
import { join } from "node:path";

import mysql from "mysql2/promise";

export function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received "${value}".`);
  }

  return parsed;
}

export async function loadLocalEnvFiles(cwd: string) {
  const candidatePaths = [
    join(cwd, ".env.local"),
    join(cwd, ".env"),
  ];

  for (const filePath of candidatePaths) {
    try {
      const contents = await readFile(filePath, "utf8");
      const lines = contents.split(/\r?\n/);

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
          continue;
        }

        const separatorIndex = line.indexOf("=");
        if (separatorIndex <= 0) {
          continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        if (!key || process.env[key] !== undefined) {
          continue;
        }

        const rawValue = line.slice(separatorIndex + 1).trim();
        const value = rawValue.length >= 2 && (
          (rawValue.startsWith("\"") && rawValue.endsWith("\""))
          || (rawValue.startsWith("'") && rawValue.endsWith("'"))
        )
          ? rawValue.slice(1, -1)
          : rawValue;

        process.env[key] = value;
      }
    } catch {
      continue;
    }
  }
}

export async function assertMariadbVectorAvailable() {
  const databaseHost = process.env.DATABASE_HOST;
  const databasePort = Number(process.env.DATABASE_PORT ?? "3306");
  const databaseUser = process.env.DATABASE_USER;
  const databasePassword = process.env.DATABASE_PASSWORD;
  const databaseName = process.env.DATABASE_NAME;

  if (!databaseHost || !databaseUser || !databasePassword || !databaseName || Number.isNaN(databasePort)) {
    throw new Error(
      "Missing DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, or DATABASE_NAME",
    );
  }

  const connection = await mysql.createConnection({
    connectTimeout: 5_000,
    database: databaseName,
    host: databaseHost,
    password: databasePassword,
    port: databasePort,
    ssl: {
      rejectUnauthorized: false,
    },
    user: databaseUser,
  });

  try {
    await connection.query(`
      select vec_distance_cosine(
        VEC_FromText('[1,0,0]'),
        VEC_FromText('[1,0,0]')
      ) as distance
    `);
  } finally {
    await connection.end();
  }
}
