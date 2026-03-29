import { eq } from "drizzle-orm";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import { ensureTestEnvLoaded } from "./load-test-env";
import { MariadbConnection } from "../../../src/lib/db";
import { fileChunks, files, users } from "../../../src/lib/db/schema";

ensureTestEnvLoaded();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function markTestUserEmailVerified(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const db = MariadbConnection.getConnection();

  await db
    .update(users)
    .set({ email_verified: true })
    .where(eq(users.email, normalizedEmail));
}

export async function cleanupTestUserByEmail(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const db = MariadbConnection.getConnection();

  const existingUser = await db
    .select({
      id: users.id,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  const user = existingUser[0];

  if (!user) {
    return;
  }

  const storedObjects = await db
    .select({
      chunkKey: fileChunks.r2_key,
      thumbnailKey: files.thumbnail_r2_key,
    })
    .from(files)
    .leftJoin(fileChunks, eq(fileChunks.file_id, files.id))
    .where(eq(files.user_id, user.id));

  const r2Keys = new Set<string>();

  for (const storedObject of storedObjects) {
    if (storedObject.chunkKey) {
      r2Keys.add(storedObject.chunkKey);
    }

    if (storedObject.thumbnailKey) {
      r2Keys.add(storedObject.thumbnailKey);
    }
  }

  await deleteR2ObjectsForUser(user.id, r2Keys);

  await db.delete(users).where(eq(users.id, user.id));
}

async function deleteR2ObjectsForUser(userId: string, r2Keys: Set<string>) {
  try {
    const r2Client = createR2Client();
    const bucketName = getR2BucketName();
    const listedObjects = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `${userId}/files/`,
      }),
    );

    for (const object of listedObjects.Contents ?? []) {
      if (object.Key) {
        r2Keys.add(object.Key);
      }
    }

    for (const key of r2Keys) {
      try {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
          }),
        );
      } catch (error) {
        console.warn(`Failed to delete R2 object during Playwright cleanup: ${key}`, error);
      }
    }
  } catch (error) {
    console.warn("Playwright cleanup could not initialize R2 helpers.", error);
  }
}

function createR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function getR2BucketName() {
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!bucketName) {
    throw new Error("Missing R2_BUCKET_NAME");
  }

  return bucketName;
}
