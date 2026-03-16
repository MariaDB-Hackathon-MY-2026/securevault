import { eq } from "drizzle-orm";

import { MariadbConnection } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function updateUserName(userId: string, name: string): Promise<void> {
  const db = MariadbConnection.getConnection();

  await db
    .update(users)
    .set({ name })
    .where(eq(users.id, userId));
}
