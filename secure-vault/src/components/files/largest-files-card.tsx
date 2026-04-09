"use client";

import { formatExplorerDate, formatFileSize } from "@/components/files/file-browser-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FolderListItem, LargestFileItem } from "@/lib/files/types";

type LargestFilesCardProps = {
  files: LargestFileItem[];
  folders: FolderListItem[];
};

export function LargestFilesCard({ files, folders }: LargestFilesCardProps) {
  const folderMap = new Map(folders.map((folder) => [folder.id, folder.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Largest files</CardTitle>
        <CardDescription>Top ready files in your active library for quick cleanup.</CardDescription>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active files yet. Uploads will appear here once they are ready.
          </p>
        ) : (
          <div className="space-y-3">
            {files.map((file) => (
              <div
                className="flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                key={file.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {file.folderId ? folderMap.get(file.folderId) ?? "Folder" : "All files"} - {file.mimeType}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground sm:text-right">
                  <p className="font-medium text-foreground">{formatFileSize(file.size)}</p>
                  <p>Updated {formatExplorerDate(file.updatedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

