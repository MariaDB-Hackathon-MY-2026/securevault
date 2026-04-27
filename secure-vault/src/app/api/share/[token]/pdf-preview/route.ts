import { NextRequest, NextResponse } from "next/server";

import { getClientIpFromHeaders } from "@/lib/auth/request-metadata";
import {
  createRateLimitResponse,
  downloadLimiter,
  enforceRateLimit,
} from "@/lib/rate-limit";
import {
  isPdfPreviewError,
  toPdfPreviewErrorResponse,
} from "@/lib/pdf-preview/errors";
import { getSharedPdfPreviewManifest } from "@/lib/pdf-preview/shared-service";
import { requireValidShareAccessSession } from "@/lib/sharing/share-access-session";
import {
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
    const rateLimit = await enforceRateLimit(
      downloadLimiter,
      `${getClientIpFromHeaders(request.headers)}:${token}`,
    );

    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit, downloadLimiter.message);
    }

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

    const manifest = await getSharedPdfPreviewManifest({
      fileId,
      ownerId: link.created_by,
      pageBaseUrl: `/api/share/${token}/pdf-preview/pages`,
      signal: request.signal,
    });

    await recordShareAccess({
      email: verifiedEmail,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      linkId: link.id,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({
      ...manifest,
      pages:
        link.targetType === "folder"
          ? manifest.pages.map((page) => ({
              ...page,
              src: `${page.src}?fileId=${encodeURIComponent(fileId)}`,
            }))
          : manifest.pages,
    });
  } catch (error) {
    if (error instanceof ShareServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (isPdfPreviewError(error)) {
      const response = toPdfPreviewErrorResponse(error);
      return NextResponse.json({ error: response.error }, { status: response.status });
    }

    console.error("Shared PDF preview manifest failed", error);
    return NextResponse.json({ error: "Failed to load PDF preview" }, { status: 500 });
  }
}
