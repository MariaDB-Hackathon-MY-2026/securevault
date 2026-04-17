import { fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { FileSearchResults } from "@/components/files/file-search-results";

vi.mock("@/components/files/file-browser-utils", () => ({
  formatExplorerDate: vi.fn(() => "Apr 15, 2026"),
  formatFileSize: vi.fn(() => "1 KB"),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", { ...props, alt: props.alt ?? "" }),
}));

describe("FileSearchResults", () => {
  it("shows semantic scores for semantic search results", () => {
    render(
      <FileSearchResults
        isRefreshing={false}
        onOpenFolder={() => undefined}
        results={[
          {
            canPreview: true,
            fileId: "file-1",
            folderId: null,
            folderPath: [],
            isInRoot: true,
            matchType: "pdf_page",
            mimeType: "application/pdf",
            name: "dog-notes.pdf",
            pageFrom: 1,
            pageTo: 1,
            retrievalSources: ["semantic"],
            score: 0.61234,
            size: 1024,
            updatedAt: "2026-04-15T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText(/Score 0.612/)).toBeTruthy();
  });

  it("shows filename-only hybrid matches without a semantic score", () => {
    render(
      <FileSearchResults
        isRefreshing={false}
        onOpenFolder={() => undefined}
        results={[
          {
            canPreview: true,
            fileId: "file-2",
            folderId: null,
            folderPath: [],
            isInRoot: true,
            matchType: "filename",
            mimeType: "application/pdf",
            name: "erd.pdf",
            pageFrom: null,
            pageTo: null,
            retrievalSources: ["filename"],
            score: 0,
            size: 1024,
            updatedAt: "2026-04-15T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText(/Filename match/)).toBeTruthy();
    expect(screen.queryByText(/Score/)).toBeNull();
  });

  it("falls back safely for legacy semantic results without retrieval sources", () => {
    render(
      <FileSearchResults
        isRefreshing={false}
        onOpenFolder={() => undefined}
        results={[
          {
            canPreview: true,
            fileId: "file-legacy",
            folderId: null,
            folderPath: [],
            isInRoot: true,
            matchType: "pdf_page",
            mimeType: "application/pdf",
            name: "legacy.pdf",
            pageFrom: 4,
            pageTo: 4,
            score: 0.734,
            size: 1024,
            updatedAt: "2026-04-15T00:00:00.000Z",
          } as never,
        ]}
      />,
    );

    expect(screen.getByText(/Semantic PDF match on pages 4-4/)).toBeTruthy();
    expect(screen.getByText(/Score 0.734/)).toBeTruthy();
  });

  it("opens a preview dialog when a previewable result card is clicked", async () => {
    render(
      <FileSearchResults
        isRefreshing={false}
        onOpenFolder={() => undefined}
        results={[
          {
            canPreview: true,
            fileId: "file-1",
            folderId: null,
            folderPath: [],
            isInRoot: true,
            matchType: "pdf_page",
            mimeType: "application/pdf",
            name: "dog-notes.pdf",
            pageFrom: 1,
            pageTo: 1,
            retrievalSources: ["semantic"],
            score: 0.61234,
            size: 1024,
            updatedAt: "2026-04-15T00:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview dog-notes.pdf" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByTitle("Preview of dog-notes.pdf")).toBeTruthy();
  });

  it("keeps the folder button focused on folder navigation without opening preview", () => {
    const onOpenFolder = vi.fn();

    render(
      <FileSearchResults
        isRefreshing={false}
        onOpenFolder={onOpenFolder}
        results={[
          {
            canPreview: true,
            fileId: "file-1",
            folderId: "folder-1",
            folderPath: [{ id: "folder-1", name: "Projects" }],
            isInRoot: false,
            matchType: "pdf_page",
            mimeType: "application/pdf",
            name: "dog-notes.pdf",
            pageFrom: 1,
            pageTo: 1,
            retrievalSources: ["semantic"],
            score: 0.61234,
            size: 1024,
            updatedAt: "2026-04-15T00:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));

    expect(onOpenFolder).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
