"use client";

import { FolderOpen } from "lucide-react";

import { formatExplorerDate, formatFileSize } from "@/components/files/file-browser-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { FilenameSearchResult } from "@/lib/search/types";

type FileSearchResultsProps = {
  isRefreshing: boolean;
  onOpenFolder: (result: FilenameSearchResult) => void;
  results: FilenameSearchResult[];
};

function formatFolderPath(result: FilenameSearchResult) {
  if (result.isInRoot) {
    return "All files";
  }

  return result.folderPath.map((item) => item.name).join(" / ");
}

export function FileSearchResults({
  isRefreshing,
  onOpenFolder,
  results,
}: FileSearchResultsProps) {
  return (
    <div className="space-y-3">
      {isRefreshing ? (
        <p className="text-sm text-muted-foreground">Refreshing search results...</p>
      ) : null}

      {results.map((result) => (
        <Card
          key={result.id}
          data-testid={`file-search-result-${result.id}`}
          data-test-file-name={result.name}
        >
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-1">
              <p
                className="truncate font-medium"
                data-testid={`file-search-result-name-${result.id}`}
                data-test-file-name={result.name}
              >
                {result.name}
              </p>
              <p className="truncate text-sm text-muted-foreground">{formatFolderPath(result)}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(result.size)} - Updated {formatExplorerDate(result.updatedAt)}
              </p>
            </div>

            <Button onClick={() => onOpenFolder(result)} type="button" variant="outline">
              <FolderOpen className="size-4" />
              Open folder
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

