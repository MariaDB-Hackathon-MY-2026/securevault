"use client";

import { useEffect, useState } from "react";

import type { PdfPreviewManifest } from "@/lib/pdf-preview/types";

type SharedPdfImagePreviewProps = {
  fileId?: string;
  fileName?: string;
  token: string;
};

function mapManifestError(status: number | null) {
  switch (status) {
    case 413:
      return "This PDF is too large for secure preview. Use download instead.";
    case 415:
      return "Preview is not supported for this file type. Use download instead.";
    case 422:
      return "This PDF cannot be rendered for secure preview. Use download instead.";
    case 503:
      return "Secure PDF preview is unavailable. Use download instead.";
    default:
      return "Failed to load PDF preview. Use download instead.";
  }
}

export function SharedPdfImagePreview({
  fileId,
  fileName,
  token,
}: SharedPdfImagePreviewProps) {
  const [failedPages, setFailedPages] = useState<number[]>([]);
  const [loadedPages, setLoadedPages] = useState<number[]>([]);
  const [manifest, setManifest] = useState<PdfPreviewManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();
    const fileQuery = fileId ? `?fileId=${encodeURIComponent(fileId)}` : "";
    const manifestUrl = `/api/share/${token}/pdf-preview${fileQuery}`;

    setFailedPages([]);
    setLoadedPages([]);
    setLoading(true);
    setManifest(null);
    setManifestError(null);

    void fetch(manifestUrl, {
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }

        const payload = (await response.json()) as PdfPreviewManifest;
        setManifest(payload);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        const status = Number(error instanceof Error ? error.message : "");
        setManifestError(mapManifestError(Number.isFinite(status) ? status : null));
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [fileId, token]);

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col gap-4 overflow-auto bg-muted/10 p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="mx-auto h-48 w-full max-w-4xl animate-pulse rounded-lg bg-muted/40"
          />
        ))}
      </div>
    );
  }

  if (manifestError) {
    return (
      <div className="px-6 text-center text-sm text-muted-foreground">
        {manifestError}
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="px-6 text-center text-sm text-muted-foreground">
        Failed to load PDF preview. Use download instead.
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-muted/15 p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {manifest.pages.map((page) => {
          const pageFailed = failedPages.includes(page.page);
          const pageLoaded = loadedPages.includes(page.page);

          return (
            <div
              key={page.page}
              className="overflow-hidden rounded-lg border bg-background shadow-sm"
              data-testid={`shared-pdf-preview-page-${page.page}`}
            >
              <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Page {page.page}
              </div>
              <div className="relative flex min-h-48 items-center justify-center bg-muted/10 p-3">
                {pageFailed || page.status === "failed" ? (
                  <p className="text-center text-sm text-muted-foreground">
                    Failed to load this preview page. You can still download the original PDF.
                  </p>
                ) : (
                  <>
                    {!pageLoaded ? (
                      <div
                        aria-hidden="true"
                        className="absolute inset-3 min-h-40 animate-pulse rounded-sm bg-muted/40"
                        data-testid={`shared-pdf-preview-page-skeleton-${page.page}`}
                      />
                    ) : null}
                    <img
                      alt={`${fileName ?? manifest.fileName ?? "Shared PDF"} page ${page.page}`}
                      className={`block h-auto w-full rounded-sm transition-opacity duration-200 ${
                        pageLoaded ? "opacity-100" : "opacity-0"
                      }`}
                      data-testid={`shared-pdf-preview-page-image-${page.page}`}
                      loading="lazy"
                      onError={() => {
                        setFailedPages((current) =>
                          current.includes(page.page) ? current : [...current, page.page],
                        );
                      }}
                      onLoad={() => {
                        setLoadedPages((current) =>
                          current.includes(page.page) ? current : [...current, page.page],
                        );
                      }}
                      src={page.src}
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
