import { NextRequest, NextResponse } from "next/server";

import { getClientIpFromHeaders } from "@/lib/auth/request-metadata";
import {
  createRateLimitResponse,
  downloadLimiter,
  enforceRateLimit,
} from "@/lib/rate-limit";
import {
  getSharedPdfPreviewConfig,
} from "@/lib/pdf-preview/config";
import {
  isPdfPreviewError,
  toPdfPreviewErrorResponse,
} from "@/lib/pdf-preview/errors";
import {
  readCachedSharedPdfPreviewPage,
  writeCachedSharedPdfPreviewPage,
} from "@/lib/pdf-preview/shared-page-cache";
import { getSharedPdfPreviewPage } from "@/lib/pdf-preview/shared-service";
import { requireValidShareAccessSession } from "@/lib/sharing/share-access-session";
import {
  assertShareLinkAccessible,
  requireFolderShareTargetFile,
  requireShareLinkByToken,
  ShareServiceError,
} from "@/lib/sharing/share-service";

const SHARED_PDF_PREVIEW_CACHE_HEADER = "X-Preview-Cache";

function parsePageNumber(page: string) {
  if (!/^\d+$/.test(page)) {
    return null;
  }

  const parsedPage = Number(page);
  return parsedPage > 0 ? parsedPage : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ page: string; token: string }> },
) {
  try {
    const { page, token } = await context.params;
    const pageNumber = parsePageNumber(page);

    if (!pageNumber) {
      return NextResponse.json({ error: "Page must be a positive integer" }, { status: 400 });
    }

    const rateLimit = await enforceRateLimit(
      downloadLimiter,
      `${getClientIpFromHeaders(request.headers)}:${token}`,
    );

    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit, downloadLimiter.message);
    }

    const link = await requireShareLinkByToken(token);
    assertShareLinkAccessible(link);

    if (!link.is_public && link.allowedEmails.length > 0) {
      const session = await requireValidShareAccessSession({ linkId: link.id, token });

      if (!session) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
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
    const renderVersion = getSharedPdfPreviewConfig().renderVersion;
    const cachedPreviewPage = await readCachedSharedPdfPreviewPage({
      fileId,
      pageNumber,
      renderVersion,
      token,
    });

    if (cachedPreviewPage) {
      return new Response(cachedPreviewPage, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Length": String(cachedPreviewPage.byteLength),
          "Content-Type": "image/webp",
          [SHARED_PDF_PREVIEW_CACHE_HEADER]: "hit",
          "X-Content-Type-Options": "nosniff",
        },
        status: 200,
      });
    }

    const response = await getSharedPdfPreviewPage({
      fileId,
      ownerId: link.created_by,
      pageNumber,
      signal: request.signal,
    });

    if (response.ok && response.headers.get("Content-Type") === "image/webp") {
      const imageBytes = Buffer.from(await response.clone().arrayBuffer());

      await writeCachedSharedPdfPreviewPage({
        expiresAt: link.expires_at,
        fileId,
        imageBytes,
        pageNumber,
        renderVersion,
        token,
      });
    }

    response.headers.set(SHARED_PDF_PREVIEW_CACHE_HEADER, "miss");
    return response;
  } catch (error) {
    if (error instanceof ShareServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (isPdfPreviewError(error)) {
      const response = toPdfPreviewErrorResponse(error);
      return NextResponse.json({ error: response.error }, { status: response.status });
    }

    console.error("Shared PDF preview page failed", error);
    return NextResponse.json({ error: "Failed to load PDF preview page" }, { status: 500 });
  }
}
