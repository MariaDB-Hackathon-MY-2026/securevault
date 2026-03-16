import { eq } from "drizzle-orm";

import { MariadbConnection } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function getUserById(userId: string) {
  const db = MariadbConnection.getConnection();

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result[0] ?? null;
}
