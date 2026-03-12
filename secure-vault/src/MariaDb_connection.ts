import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const db_host = process.env.DATABASE_HOST;
const  db_user = process.env.DATABASE_USER;
const db_password = process.env.DATABASE_PASSWORD;
const db_name = process.env.DATABASE_NAME;

if(!db_host || !db_user || !db_password || !db_name) throw new Error("Missing database connection credentials");

const poolConnection = mysql.createPool({
    host: db_host,
    user: db_user,
    database: db_name,
    password:  db_password,
    connectionLimit: 10,
});

export const db_connection = drizzle({ client: poolConnection });
