import { eq } from "drizzle-orm";

import { MariadbConnection } from "@/lib/db";
import { users } from "@/lib/db/schema";

type DbConnection = ReturnType<typeof MariadbConnection.getConnection>;
type DbTransaction = Parameters<Parameters<DbConnection["transaction"]>[0]>[0];
type DbExecutor = DbConnection | DbTransaction;

export async function updateUserPassword(
  userId: string,
  passwordHash: string,
  executor?: DbExecutor,
): Promise<void> {
  const db = executor ?? MariadbConnection.getConnection();

  await db
    .update(users)
    .set({ password_hash: passwordHash })
    .where(eq(users.id, userId));
}
