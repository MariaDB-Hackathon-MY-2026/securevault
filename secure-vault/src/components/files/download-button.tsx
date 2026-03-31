"use client";

import * as React from "react";
import { Download, LoaderCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { FileListItem } from "@/lib/files/types";

type DownloadButtonProps = {
  file: FileListItem;
};

type DownloadState = "idle" | "downloading" | "success" | "error";

export function DownloadButton({ file }: DownloadButtonProps) {
  const [downloadState, setDownloadState] = React.useState<DownloadState>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const objectUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const cancelDownload = React.useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setDownloadState("idle");
    setProgress(null);
    setErrorMessage(null);
  }, []);

  const handleDownload = React.useCallback(async () => {
    abortControllerRef.current?.abort();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setDownloadState("downloading");
    setErrorMessage(null);
    setProgress(0);

    try {
      const response = await fetch(`/api/files/${file.id}/download`, {
        credentials: "same-origin",
        signal: abortController.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Failed to download file");
      }

      if (!response.body) {
        throw new Error("Download response did not include a body");
      }

      const contentLengthHeader = response.headers.get("content-length");
      const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN;
      const hasKnownLength = Number.isFinite(totalBytes) && totalBytes > 0;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loadedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (!value || value.byteLength === 0) {
          continue;
        }

        chunks.push(value);
        loadedBytes += value.byteLength;

        setProgress(hasKnownLength ? Math.min(100, (loadedBytes / totalBytes) * 100) : null);
      }

      const blob = new Blob(chunks as unknown as BlobPart[], {
        type: response.headers.get("content-type") || file.mimeType,
      });

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }

      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;

      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => {
        if (objectUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrlRef.current = null;
        }
      }, 0);

      setDownloadState("success");
      setProgress(100);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setDownloadState("idle");
        setProgress(null);
        return;
      }

      setDownloadState("error");
      setProgress(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to download file");
    } finally {
      abortControllerRef.current = null;
    }
  }, [file.id, file.mimeType, file.name]);

  return (
    <div className="min-w-[13rem] space-y-2">
      <div className="flex items-center justify-end gap-2">
        {downloadState === "downloading" ? (
          <>
            <Button onClick={cancelDownload} size="sm" type="button" variant="ghost">
              <XCircle className="mr-1" />
              Cancel
            </Button>
            <Button disabled size="sm" type="button" variant="outline">
              <LoaderCircle className="mr-1 animate-spin" />
              Downloading
            </Button>
          </>
        ) : (
          <Button onClick={handleDownload} size="sm" type="button" variant="outline">
            <Download className="mr-1" />
            Download
          </Button>
        )}
      </div>
      {downloadState === "downloading" ? (
        <div className="space-y-1">
          {progress == null ? (
            <p className="text-right text-xs text-muted-foreground">Download in progress</p>
          ) : (
            <>
              <Progress className="h-1.5" value={progress} />
              <p className="text-right text-xs text-muted-foreground">{Math.round(progress)}%</p>
            </>
          )}
        </div>
      ) : null}
      {downloadState === "error" && errorMessage ? (
        <p className="text-right text-xs text-destructive">{errorMessage}</p>
      ) : null}
      {downloadState === "success" ? (
        <p className="text-right text-xs text-muted-foreground">Download started</p>
      ) : null}
    </div>
  );
}
