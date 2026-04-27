import "server-only";

import { getRedisAdapter } from "@/lib/redis";

const MAX_SHARED_PDF_PREVIEW_CACHE_SECONDS = 24 * 60 * 60;
const SHARED_PDF_PREVIEW_PAGE_CACHE_PREFIX = "share:pdf-preview:page";

type SharedPdfPreviewPageCacheEntry = {
  bytesBase64: string;
};

function buildSharedPdfPreviewPageCacheKey(input: {
  fileId: string;
  pageNumber: number;
  renderVersion: number;
  token: string;
}) {
  return `${SHARED_PDF_PREVIEW_PAGE_CACHE_PREFIX}:${input.token}:${input.fileId}:${input.pageNumber}:v${input.renderVersion}`;
}

export function getSharedPdfPreviewPageCacheTtlSeconds(
  expiresAt: Date | null,
  now = new Date(),
) {
  if (!expiresAt) {
    return MAX_SHARED_PDF_PREVIEW_CACHE_SECONDS;
  }

  const remainingSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);

  if (remainingSeconds <= 0) {
    return 0;
  }

  return Math.min(remainingSeconds, MAX_SHARED_PDF_PREVIEW_CACHE_SECONDS);
}

export async function readCachedSharedPdfPreviewPage(input: {
  fileId: string;
  pageNumber: number;
  renderVersion: number;
  token: string;
}) {
  const cacheKey = buildSharedPdfPreviewPageCacheKey(input);

  try {
    const adapter = await getRedisAdapter();
    const cachedValue = await adapter.get(cacheKey);

    if (!cachedValue) {
      return null;
    }

    const parsedValue = JSON.parse(cachedValue) as Partial<SharedPdfPreviewPageCacheEntry>;

    if (typeof parsedValue.bytesBase64 !== "string" || parsedValue.bytesBase64.length === 0) {
      return null;
    }

    return Buffer.from(parsedValue.bytesBase64, "base64");
  } catch (error) {
    console.warn("Failed to read shared PDF preview page cache", {
      error: error instanceof Error ? error.message : String(error),
      fileId: input.fileId,
      pageNumber: input.pageNumber,
      renderVersion: input.renderVersion,
      token: input.token,
    });
    return null;
  }
}

export async function writeCachedSharedPdfPreviewPage(input: {
  expiresAt: Date | null;
  fileId: string;
  imageBytes: Buffer;
  pageNumber: number;
  renderVersion: number;
  token: string;
}) {
  const ttlSeconds = getSharedPdfPreviewPageCacheTtlSeconds(input.expiresAt);

  if (ttlSeconds <= 0) {
    return;
  }

  const cacheKey = buildSharedPdfPreviewPageCacheKey(input);
  const cacheValue = JSON.stringify({
    bytesBase64: input.imageBytes.toString("base64"),
  } satisfies SharedPdfPreviewPageCacheEntry);

  try {
    const adapter = await getRedisAdapter();
    await adapter.set(cacheKey, cacheValue, { ex: ttlSeconds });
  } catch (error) {
    console.warn("Failed to write shared PDF preview page cache", {
      error: error instanceof Error ? error.message : String(error),
      fileId: input.fileId,
      pageNumber: input.pageNumber,
      renderVersion: input.renderVersion,
      token: input.token,
      ttlSeconds,
    });
  }
}
