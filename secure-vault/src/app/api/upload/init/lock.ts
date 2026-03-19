import { sql } from "drizzle-orm";

import { UPLOAD_INIT_LOCK_TIMEOUT_SECONDS } from "@/lib/constants";

import { UploadInitServiceError } from "./errors";
import type { DbTransaction } from "./types";

export async function acquireUploadInitLock(
  tx: DbTransaction,
  lockName: string,
): Promise<void> {
  const lockResult = await tx.execute(sql`
    SELECT GET_LOCK(${lockName}, ${UPLOAD_INIT_LOCK_TIMEOUT_SECONDS}) AS acquired
  `);
  const lockRows = lockResult as unknown as Array<{ acquired?: number }>;
  const lockAcquired = Number(lockRows[0]?.acquired ?? 0);

  if (lockAcquired !== 1) {
    throw new UploadInitServiceError(
      "Upload initialization is already in progress. Please retry.",
      409,
    );
  }
}

export async function releaseUploadInitLock(
  tx: DbTransaction,
  lockName: string,
): Promise<void> {
  await tx.execute(sql`
    SELECT RELEASE_LOCK(${lockName}) AS released
  `);
}
