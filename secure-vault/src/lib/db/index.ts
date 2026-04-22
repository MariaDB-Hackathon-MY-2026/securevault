import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

type SecureVaultDbGlobal = typeof globalThis & {
  __secureVaultDbConnection?: MySql2Database;
};

const secureVaultDbGlobal = globalThis as SecureVaultDbGlobal;

export class MariadbConnection {
  private static dbConnection: MySql2Database | null = null;

  private static normalizePem(value?: string) {
    return value?.replace(/\\n/g, "\n");
  }

  private static buildSslConfig() {
    const sslMode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();

    if (!sslMode || sslMode === "disable" || sslMode === "off" || sslMode === "false") {
      return undefined;
    }

    const ca = this.normalizePem(process.env.DATABASE_SSL_CA);
    const cert = this.normalizePem(process.env.DATABASE_SSL_CERT);
    const key = this.normalizePem(process.env.DATABASE_SSL_KEY);

    return {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
      ...(cert ? { cert } : {}),
      ...(key ? { key } : {}),
    };
  }

  private static initialize() {
    const dbHost = process.env.DATABASE_HOST;
    const dbPort = Number(process.env.DATABASE_PORT ?? "3306");
    const dbUser = process.env.DATABASE_USER;
    const dbPassword = process.env.DATABASE_PASSWORD;
    const dbName = process.env.DATABASE_NAME;
    const dbConnectionLimit = Number(process.env.DATABASE_CONNECTION_LIMIT ?? "4");

    if (
      !dbHost
      || !dbUser
      || !dbPassword
      || !dbName
      || Number.isNaN(dbPort)
      || Number.isNaN(dbConnectionLimit)
      || dbConnectionLimit < 1
    ) {
      throw new Error(
        "Missing or invalid DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME, or DATABASE_CONNECTION_LIMIT",
      );
    }

    const ssl = this.buildSslConfig();

    const poolConnection = mysql.createPool({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      database: dbName,
      password: dbPassword,
      connectionLimit: dbConnectionLimit,
      timezone: "Z",
      ...(ssl ? { ssl } : {}),
    });

    return drizzle({ client: poolConnection });
  }

  public static getConnection() {
    if (!this.dbConnection) {
      this.dbConnection = secureVaultDbGlobal.__secureVaultDbConnection ?? this.initialize();
      secureVaultDbGlobal.__secureVaultDbConnection = this.dbConnection;
    }

    return this.dbConnection;
  }
}
