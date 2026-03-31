"use client";

import { DownloadButton } from "@/components/files/download-button";
import { FilePreview } from "@/components/files/file-preview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilesQuery } from "@/hooks/use-files-query";
import type { FileListItem } from "@/lib/files/types";

type FilesLibraryProps = {
  initialFiles: FileListItem[];
};

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatUploadDate(isoDate: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

export function FilesLibrary({ initialFiles }: FilesLibraryProps) {
  const { data: files = initialFiles, isFetching } = useFilesQuery(initialFiles);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Your files</CardTitle>
            <CardDescription>
              Download or preview files once upload encryption and chunk assembly are complete.
            </CardDescription>
          </div>
          {isFetching ? (
            <p className="text-xs text-muted-foreground">Refreshing files…</p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Ready files will appear here after an upload completes.
          </div>
        ) : (
          <div className="grid gap-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex flex-col gap-4 rounded-lg border border-border p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{file.mimeType.split('/')[1]}</span>
                    <span>{formatFileSize(file.size)}</span>
                    <span>Uploaded {formatUploadDate(file.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FilePreview file={file} />
                  <DownloadButton file={file} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
