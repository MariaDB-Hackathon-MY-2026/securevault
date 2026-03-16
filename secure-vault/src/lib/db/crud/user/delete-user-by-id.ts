import { eq } from "drizzle-orm";

import { MariadbConnection } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function deleteUserById(userId: string): Promise<void> {
  const db = MariadbConnection.getConnection();

  await db.delete(users).where(eq(users.id, userId));
}
