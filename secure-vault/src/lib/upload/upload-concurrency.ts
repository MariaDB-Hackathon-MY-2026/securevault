import { randomUUID } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { UPLOAD_SESSION_ID_LENGTH } from "@/lib/constants";
import {
  MAX_ACTIVE_UPLOADS_PER_USER,
  UPLOAD_ACTIVE_LEASE_TTL_SECONDS,
  UPLOAD_ACTIVE_LOCK_TTL_SECONDS,
  UPLOAD_ACTIVE_RECORD_TTL_SECONDS,
} from "@/lib/constants/upload";
import { MariadbConnection } from "@/lib/db";
import { uploadSessions } from "@/lib/db/schema";
import { getRedisAdapter } from "@/lib/redis";

const uploadIdBodySchema = z.object({
  uploadId: z.string().trim().length(UPLOAD_SESSION_ID_LENGTH),
});

const UPLOAD_LOCK_RETRY_DELAY_MS = 50;
const UPLOAD_LOCK_RETRY_ATTEMPTS = 20;
const ACTIVE_UPLOADS_PREFIX = "upload:active";
const ACTIVE_UPLOAD_LOCK_PREFIX = "upload:active-lock";
const ACTIVE_UPLOAD_LEASE_PREFIX = "upload:lease";

type ActiveUploadsRecord = {
  count: number;
  uploadIds: string[];
};

export type UploadSlotClaimResult = {
  activeCount: number;
  maxActiveUploads: number;
  retryAfterSeconds: number;
  success: boolean;
};

export class UploadConcurrencyError extends Error {
  readonly retryAfterSeconds: number | null;
  readonly status: number;

  constructor(message: string, status: number, retryAfterSeconds?: number | null) {
    super(message);
    this.name = "UploadConcurrencyError";
    this.retryAfterSeconds = retryAfterSeconds ?? null;
    this.status = status;
  }
}

export function validateUploadSlotBody(body: unknown) {
  const parsedBody = uploadIdBodySchema.safeParse(body);

  if (!parsedBody.success) {
    const message = parsedBody.error.issues[0]?.message ?? "uploadId is required";
    throw new UploadConcurrencyError(message, 400);
  }

  return parsedBody.data;
}

export async function requireOwnedUploadSession(userId: string, uploadId: string) {
  const db = MariadbConnection.getConnection();
  const [session] = await db
    .select({ id: uploadSessions.id })
    .from(uploadSessions)
    .where(and(eq(uploadSessions.id, uploadId), eq(uploadSessions.user_id, userId)))
    .limit(1);

  if (!session) {
    throw new UploadConcurrencyError("Upload session not found", 404);
  }

  return session;
}

export async function requireOwnedActiveUploadSession(userId: string, uploadId: string) {
  const currentDate = new Date();
  const db = MariadbConnection.getConnection();
  const [session] = await db
    .select({ id: uploadSessions.id })
    .from(uploadSessions)
    .where(
      and(
        eq(uploadSessions.id, uploadId),
        eq(uploadSessions.user_id, userId),
        eq(uploadSessions.status, "uploading"),
        gt(uploadSessions.expires_at, currentDate),
      ),
    )
    .limit(1);

  if (!session) {
    throw new UploadConcurrencyError("Upload session not found or expired", 404);
  }

  return session;
}

export async function claimUploadSlot(input: {
  uploadId: string;
  userId: string;
}): Promise<UploadSlotClaimResult> {
  return withUserUploadLock(input.userId, async () => {
    const adapter = await getRedisAdapter();
    const recordKey = getUserActiveUploadsKey(input.userId);
    const leaseKey = getUploadLeaseKey(input.uploadId);
    const existingLeaseOwner = await adapter.get(leaseKey);
    const record = await repairActiveUploadsRecord(input.userId);

    if (record.uploadIds.includes(input.uploadId) || existingLeaseOwner === input.userId) {
      const nextRecord = addUploadId(record, input.uploadId);

      await persistActiveUploadsRecord(recordKey, nextRecord);
      await adapter.set(leaseKey, input.userId, { ex: UPLOAD_ACTIVE_LEASE_TTL_SECONDS });

      return {
        activeCount: nextRecord.count,
        maxActiveUploads: MAX_ACTIVE_UPLOADS_PER_USER,
        retryAfterSeconds: UPLOAD_ACTIVE_LEASE_TTL_SECONDS,
        success: true,
      };
    }

    if (record.count >= MAX_ACTIVE_UPLOADS_PER_USER) {
      return {
        activeCount: record.count,
        maxActiveUploads: MAX_ACTIVE_UPLOADS_PER_USER,
        retryAfterSeconds: await getRetryAfterSeconds(record.uploadIds),
        success: false,
      };
    }

    const nextRecord = addUploadId(record, input.uploadId);

    await persistActiveUploadsRecord(recordKey, nextRecord);
    await adapter.set(leaseKey, input.userId, { ex: UPLOAD_ACTIVE_LEASE_TTL_SECONDS });

    return {
      activeCount: nextRecord.count,
      maxActiveUploads: MAX_ACTIVE_UPLOADS_PER_USER,
      retryAfterSeconds: UPLOAD_ACTIVE_LEASE_TTL_SECONDS,
      success: true,
    };
  });
}

export async function releaseUploadSlot(input: { uploadId: string; userId: string }) {
  await withUserUploadLock(input.userId, async () => {
    const adapter = await getRedisAdapter();
    const recordKey = getUserActiveUploadsKey(input.userId);
    const leaseKey = getUploadLeaseKey(input.uploadId);
    const record = await repairActiveUploadsRecord(input.userId);
    const nextRecord = removeUploadId(record, input.uploadId);

    await adapter.del(leaseKey);

    if (nextRecord.count > 0) {
      await persistActiveUploadsRecord(recordKey, nextRecord);
      return;
    }

    await adapter.del(recordKey);
  });
}

async function repairActiveUploadsRecord(userId: string) {
  const adapter = await getRedisAdapter();
  const recordKey = getUserActiveUploadsKey(userId);
  const record = parseActiveUploadsRecord(await adapter.get(recordKey));
  const liveUploadIds: string[] = [];

  for (const uploadId of record.uploadIds) {
    const leaseOwner = await adapter.get(getUploadLeaseKey(uploadId));

    if (leaseOwner === userId) {
      liveUploadIds.push(uploadId);
    }
  }

  const repairedRecord = {
    count: liveUploadIds.length,
    uploadIds: liveUploadIds,
  };

  if (repairedRecord.count > 0) {
    await persistActiveUploadsRecord(recordKey, repairedRecord);
  } else {
    await adapter.del(recordKey);
  }

  return repairedRecord;
}

async function persistActiveUploadsRecord(recordKey: string, record: ActiveUploadsRecord) {
  const adapter = await getRedisAdapter();

  await adapter.set(recordKey, JSON.stringify(record), {
    ex: UPLOAD_ACTIVE_RECORD_TTL_SECONDS,
  });
}

function addUploadId(record: ActiveUploadsRecord, uploadId: string): ActiveUploadsRecord {
  const uploadIds = [...new Set([...record.uploadIds, uploadId])];

  return {
    count: uploadIds.length,
    uploadIds,
  };
}

function removeUploadId(record: ActiveUploadsRecord, uploadId: string): ActiveUploadsRecord {
  const uploadIds = record.uploadIds.filter((currentUploadId) => currentUploadId !== uploadId);

  return {
    count: uploadIds.length,
    uploadIds,
  };
}

function parseActiveUploadsRecord(value: string | null): ActiveUploadsRecord {
  if (!value) {
    return {
      count: 0,
      uploadIds: [],
    };
  }

  try {
    const parsed = JSON.parse(value) as {
      count?: unknown;
      uploadIds?: unknown;
    };
    const uploadIds = Array.isArray(parsed.uploadIds)
      ? [...new Set(parsed.uploadIds.filter((item): item is string => typeof item === "string"))]
      : [];

    return {
      count: uploadIds.length,
      uploadIds,
    };
  } catch {
    return {
      count: 0,
      uploadIds: [],
    };
  }
}

async function getRetryAfterSeconds(uploadIds: string[]) {
  const adapter = await getRedisAdapter();
  const ttls: number[] = [];

  for (const uploadId of uploadIds) {
    const ttl = await adapter.ttl(getUploadLeaseKey(uploadId));

    if (ttl > 0) {
      ttls.push(ttl);
    }
  }

  if (ttls.length === 0) {
    return UPLOAD_ACTIVE_LEASE_TTL_SECONDS;
  }

  return Math.min(...ttls);
}

async function withUserUploadLock<T>(
  userId: string,
  action: () => Promise<T>,
): Promise<T> {
  const adapter = await getRedisAdapter();
  const lockKey = getUserUploadLockKey(userId);
  const lockToken = randomUUID();

  for (let attempt = 0; attempt < UPLOAD_LOCK_RETRY_ATTEMPTS; attempt += 1) {
    const lockResult = await adapter.set(lockKey, lockToken, {
      ex: UPLOAD_ACTIVE_LOCK_TTL_SECONDS,
      nx: true,
    });

    if (lockResult === "OK") {
      try {
        return await action();
      } finally {
        const currentLockToken = await adapter.get(lockKey);

        if (currentLockToken === lockToken) {
          await adapter.del(lockKey);
        }
      }
    }

    await sleep(UPLOAD_LOCK_RETRY_DELAY_MS);
  }

  throw new UploadConcurrencyError(
    "Upload slot coordination is temporarily unavailable",
    503,
  );
}

function getUserActiveUploadsKey(userId: string) {
  return `${ACTIVE_UPLOADS_PREFIX}:${userId}`;
}

function getUserUploadLockKey(userId: string) {
  return `${ACTIVE_UPLOAD_LOCK_PREFIX}:${userId}`;
}

function getUploadLeaseKey(uploadId: string) {
  return `${ACTIVE_UPLOAD_LEASE_PREFIX}:${uploadId}`;
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
