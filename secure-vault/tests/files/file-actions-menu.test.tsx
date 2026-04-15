import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileActionsMenu } from "@/components/files/file-actions-menu";
import type { FileListItem } from "@/lib/files/types";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

function createFile(overrides: Partial<FileListItem> = {}): FileListItem {
  return {
    createdAt: "2026-03-20T00:00:00.000Z",
    folderId: null,
    id: "file-1",
    mimeType: "application/pdf",
    name: "report.pdf",
    size: 1024,
    updatedAt: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function renderMenu(file: FileListItem = createFile()) {
  return render(
    <FileActionsMenu
      file={file}
      onDelete={vi.fn()}
      onMove={vi.fn()}
      onRename={vi.fn()}
      onShare={vi.fn()}
      semanticSearchEnabled={true}
    />,
  );
}

function mockJsonResponse(body: unknown, init?: ResponseInit) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 200,
      ...init,
    }),
  );
}

describe("FileActionsMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("offers a retry action for retryable failed indexing jobs", async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() => mockJsonResponse({
        jobs: [
          {
            errorCode: "EMBEDDING_PROVIDER_FAILED",
            errorMessage: "Provider timed out.",
            modality: "pdf",
            retryable: true,
            status: "failed",
          },
        ],
      }))
      .mockImplementationOnce((_input, init) => {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({
          action: "retry",
          fileId: "file-1",
          modality: "pdf",
        }));

        return mockJsonResponse({
          status: "queued",
        }, { status: 202 });
      })
      .mockImplementationOnce(() => mockJsonResponse({
        jobs: [
          {
            errorCode: null,
            errorMessage: null,
            modality: "pdf",
            retryable: false,
            status: "queued",
          },
        ],
      }));

    renderMenu();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Open actions for report.pdf" }), {
      button: 0,
      ctrlKey: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Retry indexing")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Retry indexing"));

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Semantic indexing retry queued.");
    });
  });

  it("explains unretryable failures and offers re-indexing instead", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => mockJsonResponse({
      jobs: [
        {
          errorCode: "VECTOR_DIMENSION_MISMATCH",
          errorMessage: "Vector dimensions do not match the configured schema.",
          modality: "pdf",
          retryable: false,
          status: "failed",
        },
      ],
    }));

    renderMenu();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Open actions for report.pdf" }), {
      button: 0,
      ctrlKey: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Retry unavailable")).toBeTruthy();
      expect(screen.getByText("View details")).toBeTruthy();
      expect(screen.getByText("Re-index file")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("View details"));

    await waitFor(() => {
      expect(screen.getByText("Vector dimensions do not match the configured schema.")).toBeTruthy();
      expect(screen.getByText("VECTOR_DIMENSION_MISMATCH")).toBeTruthy();
    });
  });
});
