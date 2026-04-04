import { NextRequest, NextResponse } from "next/server";

import { requireValidShareAccessSession } from "@/lib/sharing/share-access-session";
import {
  assertShareLinkAccessible,
  requireSharedFolderContents,
  requireShareLinkByToken,
  ShareServiceError,
} from "@/lib/sharing/share-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const link = await requireShareLinkByToken(token);

    if (link.targetType !== "folder") {
      return NextResponse.json({ error: "Share link not found" }, { status: 404 });
    }

    assertShareLinkAccessible(link);

    if (!link.is_public && link.allowedEmails.length > 0) {
      const session = await requireValidShareAccessSession({ linkId: link.id, token });

      if (!session) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const currentFolderId =
      new URL(request.url).searchParams.get("folderId")?.trim() || link.targetId;

    const contents = await requireSharedFolderContents({
      currentFolderId,
      ownerId: link.created_by,
      rootFolderId: link.targetId,
    });

    return NextResponse.json(contents);
  } catch (error) {
    if (error instanceof ShareServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Shared folder listing failed", error);
    return NextResponse.json({ error: "Failed to load folder" }, { status: 500 });
  }
}
