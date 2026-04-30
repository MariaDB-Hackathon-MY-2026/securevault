"use client";

import { FileIcon } from "lucide-react";

import { SharedInspectionDeterrent } from "@/components/share/shared-inspection-deterrent";
import { ProtectedPreviewImage } from "@/components/share/protected-preview-image";
import { SharedDownloadButton } from "@/components/share/shared-download-button";
import { SharedPdfImagePreview } from "@/components/share/shared-pdf-image-preview";
import { ShareLogoutButton } from "@/components/share/share-logout-button";
import { canPreviewMime } from "@/lib/files/preview";

export function SharedFileView({
  embedded = false,
  email,
  fileId,
  fileName,
  mimeType,
  token,
}: {
  embedded?: boolean;
  email: string | null;
  fileId?: string;
  fileName?: string;
  mimeType?: string;
  token: string;
}) {
  const fileQuery = fileId ? `?fileId=${encodeURIComponent(fileId)}` : "";
  const downloadUrl = `/api/share/${token}/download${fileQuery}`;
  const previewUrl = `/api/share/${token}/preview${fileQuery}`;
  const isImage = Boolean(mimeType && mimeType.startsWith("image/"));
  const isPdf = mimeType === "application/pdf";
  const canPreview = mimeType ? canPreviewMime(mimeType) : true;

  return (
    <div
      data-testid="shared-file-view"
      className={`flex w-full flex-col bg-muted/20 ${
        embedded ? "min-h-0 flex-1 overflow-hidden" : "h-dvh overflow-hidden"
      }`}
    >
      <SharedInspectionDeterrent />
      <header className="flex h-14 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-2 font-medium">
          <FileIcon className="size-5 text-muted-foreground" />
          Secure Share
        </div>
        <div className="hidden items-center gap-2 border-l pl-4 opacity-75 sm:flex">
          {email ? <span className="text-sm">Verified as {email}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {email ? <ShareLogoutButton token={token} /> : null}
          <SharedDownloadButton fileName={fileName} href={downloadUrl} />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-4">
        <div
          className={`flex w-full max-w-5xl items-center justify-center overflow-hidden rounded-lg border bg-background shadow-sm ${
            embedded ? "h-full min-h-0" : "h-full"
          }`}
        >
          {!canPreview ? (
            <div className="px-6 text-center text-sm text-muted-foreground">
              Preview is not supported for this file type. Use download instead.
            </div>
          ) : isImage ? (
            <div
              className={`flex w-full items-center justify-center overflow-hidden bg-muted/20 ${
                embedded
                  ? "h-full min-h-0"
                  : "h-[calc(100dvh-7rem)] sm:h-[calc(100dvh-8rem)]"
              }`}
              onContextMenu={(event) => {
                event.preventDefault();
              }}
            >
              <ProtectedPreviewImage
                alt={fileName ?? "Shared file preview"}
                className="h-full w-full select-none"
                imageClassName="h-full w-full bg-contain bg-center bg-no-repeat"
                src={previewUrl}
                testId="shared-preview-image"
              />
            </div>
          ) : isPdf ? (
            <SharedPdfImagePreview fileId={fileId} fileName={fileName} token={token} />
          ) : (
            <iframe
              className="h-full w-full border-0"
              data-testid="shared-preview-frame"
              src={previewUrl}
              title="File Preview"
            />
          )}
        </div>
      </main>
    </div>
  );
}
