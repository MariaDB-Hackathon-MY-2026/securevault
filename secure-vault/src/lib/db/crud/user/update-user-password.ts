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

  const result = await db
    .update(users)
    .set({ password_hash: passwordHash })
    .where(eq(users.id, userId));

  const affectedCount = getAffectedCount(result);

  if (affectedCount === 0) {
    throw new Error(`Password update affected 0 rows for userId=${userId}`);
  }
}

function getAffectedCount(result: unknown) {
  if (Array.isArray(result)) {
    return getAffectedCount(result[0]);
  }

  if (!result || typeof result !== "object") {
    return 0;
  }

  const maybeResult = result as { affectedRows?: number; rowsAffected?: number };
  return maybeResult.rowsAffected ?? maybeResult.affectedRows ?? 0;
}
