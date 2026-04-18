"use client";

import * as React from "react";
import { FolderOpen } from "lucide-react";

import { formatExplorerDate, formatFileSize } from "@/components/files/file-browser-utils";
import { FilePreviewDialog, type FilePreviewItem } from "@/components/files/file-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { canPreviewMime } from "@/lib/files/preview";
import type { FilenameSearchResult, SemanticSearchResult } from "@/lib/search/types";

type FileSearchResultsProps = {
  isRefreshing: boolean;
  onOpenFolder: (result: FilenameSearchResult | SemanticSearchResult) => void;
  results: Array<FilenameSearchResult | SemanticSearchResult>;
};

function formatFolderPath(result: FilenameSearchResult | SemanticSearchResult) {
  if (result.isInRoot) {
    return "All files";
  }

  return result.folderPath.map((item) => item.name).join(" / ");
}

function formatSemanticScore(score: number) {
  return score.toFixed(3);
}

function getRetrievalSources(result: SemanticSearchResult) {
  if (result.retrievalSources && result.retrievalSources.length > 0) {
    return result.retrievalSources;
  }

  return result.matchType === "filename" ? ["filename"] : ["semantic"];
}

function getSecondaryCopy(result: FilenameSearchResult | SemanticSearchResult) {
  if (!("matchType" in result)) {
    return `${formatFileSize(result.size)} - Updated ${formatExplorerDate(result.updatedAt)}`;
  }

  const retrievalSources = getRetrievalSources(result);
  const sourceLabel = retrievalSources.includes("filename") && retrievalSources.includes("semantic")
    ? "Hybrid match"
    : result.matchType === "filename"
      ? "Filename match"
      : result.matchType === "image"
        ? "Semantic image match"
        : result.pageFrom && result.pageTo
          ? `Semantic PDF match on pages ${result.pageFrom}-${result.pageTo}`
          : "Semantic PDF match";

  if (result.matchType === "filename") {
    return `${sourceLabel} - ${formatFileSize(result.size)} - Updated ${formatExplorerDate(result.updatedAt)}`;
  }

  return `${sourceLabel} - Score ${formatSemanticScore(result.score)} - ${formatFileSize(result.size)} - Updated ${formatExplorerDate(result.updatedAt)}`;
}

function getResultId(result: FilenameSearchResult | SemanticSearchResult) {
  return "fileId" in result ? result.fileId : result.id;
}

function canPreviewSearchResult(result: FilenameSearchResult | SemanticSearchResult) {
  return "canPreview" in result ? result.canPreview : canPreviewMime(result.mimeType);
}

function toPreviewFile(result: FilenameSearchResult | SemanticSearchResult): FilePreviewItem {
  return {
    id: getResultId(result),
    mimeType: result.mimeType,
    name: result.name,
  };
}

export function FileSearchResults({
  isRefreshing,
  onOpenFolder,
  results,
}: FileSearchResultsProps) {
  const [previewFile, setPreviewFile] = React.useState<FilePreviewItem | null>(null);

  return (
    <>
      <div className="space-y-3">
        {isRefreshing ? (
          <p className="text-sm text-muted-foreground">Refreshing search results...</p>
        ) : null}

        {results.map((result) => {
          const resultId = getResultId(result);
          const isPreviewable = canPreviewSearchResult(result);

          return (
            <Card
              aria-label={isPreviewable ? `Preview ${result.name}` : undefined}
              className={
                isPreviewable
                  ? "cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/20"
                  : undefined
              }
              data-testid={`file-search-result-${resultId}`}
              data-test-file-name={result.name}
              key={resultId}
              onClick={isPreviewable ? () => setPreviewFile(toPreviewFile(result)) : undefined}
              onKeyDown={isPreviewable ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPreviewFile(toPreviewFile(result));
                }
              } : undefined}
              role={isPreviewable ? "button" : undefined}
              tabIndex={isPreviewable ? 0 : undefined}
            >
              <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <p
                    className="truncate font-medium"
                    data-testid={`file-search-result-name-${resultId}`}
                    data-test-file-name={result.name}
                  >
                    {result.name}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{formatFolderPath(result)}</p>
                  <p className="text-sm text-muted-foreground">{getSecondaryCopy(result)}</p>
                </div>

                <Button
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenFolder(result);
                  }}
                  type="button"
                  variant="outline"
                >
                  <FolderOpen className="size-4" />
                  Open folder
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <FilePreviewDialog
        file={previewFile}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewFile(null);
          }
        }}
        open={previewFile !== null}
      />
    </>
  );
}

