"use client";

import { FolderOpen } from "lucide-react";

import { formatExplorerDate, formatFileSize } from "@/components/files/file-browser-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

      {results.map((result) => {
        const resultId = getResultId(result);

        return (
        <Card
          key={resultId}
          data-testid={`file-search-result-${resultId}`}
          data-test-file-name={result.name}
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

            <Button onClick={() => onOpenFolder(result)} type="button" variant="outline">
              <FolderOpen className="size-4" />
              Open folder
            </Button>
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}

