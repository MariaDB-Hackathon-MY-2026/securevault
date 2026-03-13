import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

export class MariadbConnection {
  private static dbConnection: MySql2Database | null = null;

  private static initialize() {
    const dbHost = process.env.DATABASE_HOST;
    const dbPort = Number(process.env.DATABASE_PORT ?? "3306");
    const dbUser = process.env.DATABASE_USER;
    const dbPassword = process.env.DATABASE_PASSWORD;
    const dbName = process.env.DATABASE_NAME;

    if (!dbHost || !dbUser || !dbPassword || !dbName || Number.isNaN(dbPort)) {
      throw new Error(
        "Missing DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, or DATABASE_NAME",
      );
    }

    const poolConnection = mysql.createPool({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      database: dbName,
      password: dbPassword,
      connectionLimit: 10,
      timezone: "Z",
      ssl: {
        rejectUnauthorized: false,
      },
    });

    return drizzle({ client: poolConnection });
  }

  public static getConnection() {
    if (!this.dbConnection) {
      this.dbConnection = this.initialize();
    }

    return this.dbConnection;
  }
}
