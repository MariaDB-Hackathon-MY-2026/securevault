import { eq } from "drizzle-orm";

import { MariadbConnection } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  const db = MariadbConnection.getConnection();

  await db
    .update(users)
    .set({ password_hash: passwordHash })
    .where(eq(users.id, userId));
}
