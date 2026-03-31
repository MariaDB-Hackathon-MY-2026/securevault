import { and, desc, eq, isNull } from "drizzle-orm";

import { MariadbConnection } from "@/lib/db";
import { files } from "@/lib/db/schema";
import type { FileListItem } from "@/lib/files/types";

export async function listReadyFilesForUser(userId: string): Promise<FileListItem[]> {
  const db = MariadbConnection.getConnection();
  const result = await db
    .select({
      createdAt: files.created_at,
      id: files.id,
      mimeType: files.mime_type,
      name: files.name,
      size: files.size,
    })
    .from(files)
    .where(
      and(
        eq(files.user_id, userId),
        eq(files.status, "ready"),
        isNull(files.deleted_at),
      ),
    )
    .orderBy(desc(files.created_at));

  return result.map((file) => ({
    createdAt: new Date(file.createdAt).toISOString(),
    id: file.id,
    mimeType: file.mimeType,
    name: file.name,
    size: file.size,
  }));
}
