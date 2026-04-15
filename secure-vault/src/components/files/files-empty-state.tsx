"use client";

import { FolderSearch, FolderTree } from "lucide-react";

type FilterEmptyStateProps = {
  hasFilter: boolean;
  mode: "filter";
};

type FilenameEmptyStateProps = {
  message?: string;
  mode: "filename" | "semantic";
  query?: string;
  state: "blank" | "short" | "loading" | "empty" | "error" | "disabled";
};

type FilesEmptyStateProps = FilterEmptyStateProps | FilenameEmptyStateProps;

function getFilenameStateContent(props: FilenameEmptyStateProps) {
  if (props.state === "blank") {
    return {
      body: "Search across every ready filename in your library.",
      title: "Start a filename search",
    };
  }

  if (props.state === "short") {
    return {
      body: "Enter at least 2 characters before the app calls the global filename search API.",
      title: "Keep typing to search",
    };
  }

  if (props.state === "loading") {
    return {
      body: props.mode === "semantic"
        ? "Searching indexed PDFs and images by meaning."
        : "Looking through ready filenames across all folders.",
      title: props.mode === "semantic" ? "Searching semantically" : "Searching filenames",
    };
  }

  if (props.state === "disabled") {
    return {
      body: props.message ?? "Semantic search is turned off right now.",
      title: "Semantic search is disabled",
    };
  }

  if (props.state === "error") {
    return {
      body: props.message ?? "Something went wrong while searching your files.",
      title: "Search is unavailable",
    };
  }

  return {
    body: props.mode === "semantic"
      ? `No indexed files matched "${props.query ?? ""}" semantically. Try a broader description.`
      : `No ready files matched "${props.query ?? ""}". Try a different file name.`,
    title: props.mode === "semantic" ? "No semantic matches" : "No matching filenames",
  };
}

export function FilesEmptyState(props: FilesEmptyStateProps) {
  const isSearchEmptyState = props.mode === "filename" || props.mode === "semantic";
  const content = isSearchEmptyState
    ? getFilenameStateContent(props)
    : {
        body: props.mode === "filter" && props.hasFilter
          ? "Try a different search term or clear the current filter."
          : "Upload a file to get started, or move files into this folder from another location.",
        title: props.mode === "filter" && props.hasFilter
          ? "No matching files or folders"
          : "This folder is empty",
      };

  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        {isSearchEmptyState ? (
          <FolderSearch className="size-10 text-muted-foreground" />
        ) : (
          <FolderTree className="size-10 text-muted-foreground" />
        )}
        <p className="text-base font-medium">{content.title}</p>
        <p className="text-sm text-muted-foreground">{content.body}</p>
      </div>
    </div>
  );
}
