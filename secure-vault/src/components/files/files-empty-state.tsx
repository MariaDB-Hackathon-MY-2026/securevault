"use client";

import { FolderSearch, FolderTree } from "lucide-react";

type FilterEmptyStateProps = {
  hasFilter: boolean;
  mode: "filter";
};

type FilenameEmptyStateProps = {
  message?: string;
  mode: "filename";
  query?: string;
  state: "blank" | "short" | "loading" | "empty" | "error";
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
      body: "Looking through ready filenames across all folders.",
      title: "Searching filenames",
    };
  }

  if (props.state === "error") {
    return {
      body: props.message ?? "Something went wrong while searching your files.",
      title: "Search is unavailable",
    };
  }

  return {
    body: `No ready files matched "${props.query ?? ""}". Try a different file name.`,
    title: "No matching filenames",
  };
}

export function FilesEmptyState(props: FilesEmptyStateProps) {
  const isFilenameMode = props.mode === "filename";
  const content = isFilenameMode
    ? getFilenameStateContent(props)
    : {
        body: props.hasFilter
          ? "Try a different search term or clear the current filter."
          : "Upload a file to get started, or move files into this folder from another location.",
        title: props.hasFilter ? "No matching files or folders" : "This folder is empty",
      };

  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        {isFilenameMode ? (
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
