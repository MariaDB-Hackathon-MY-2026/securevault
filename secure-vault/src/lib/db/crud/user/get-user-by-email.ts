import {MariadbConnection} from "@/lib/db";
import {users} from "@/lib/db/schema";
import {eq} from "drizzle-orm";

export async  function getUserByEmail(email:string){
    const db_conn = MariadbConnection.getConnection();

    const result = await db_conn.select({
        userId: users.id,
        passwordHash: users.password_hash,
    }).from(users).where(eq(users.email,email))
    return result;
}