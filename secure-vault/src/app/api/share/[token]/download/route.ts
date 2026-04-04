import { NextRequest, NextResponse } from "next/server";

import { FileDownloadServiceError, streamSharedFile } from "@/app/api/files/[id]/service";
import { requireValidShareAccessSession } from "@/lib/sharing/share-access-session";
import {
  assertDownloadAllowed,
  assertShareLinkAccessible,
  recordShareAccess,
  requireFolderShareTargetFile,
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
    assertShareLinkAccessible(link);

    let verifiedEmail: string | null = null;

    if (!link.is_public && link.allowedEmails.length > 0) {
      const session = await requireValidShareAccessSession({ linkId: link.id, token });

      if (!session) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      verifiedEmail = session.email;
    }

    const { searchParams } = new URL(request.url);
    const fileId =
      link.targetType === "file"
        ? link.targetId
        : await requireFolderShareTargetFile({
            fileId: searchParams.get("fileId")?.trim() ?? "",
            ownerId: link.created_by,
            rootFolderId: link.targetId,
          });

    const response = await streamSharedFile({
      disposition: "attachment",
      fileId,
      ownerId: link.created_by,
      signal: request.signal,
    });

    await assertDownloadAllowed(link.id);

    await recordShareAccess({
      email: verifiedEmail,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      linkId: link.id,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return response;
  } catch (error) {
    if (error instanceof ShareServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof FileDownloadServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Shared download failed", error);
    return NextResponse.json({ error: "Failed to stream file" }, { status: 500 });
  }
}
