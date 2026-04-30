import { beforeEach, describe, expect, it, vi } from "vitest";

const insertedValues = vi.fn();
const updateSet = vi.fn();
const updateWhere = vi.fn();
const limit = vi.fn();
const thenMock = vi.fn();
const whereMock = vi.fn();
const selectFrom = vi.fn();

vi.mock("@/lib/db", () => ({
  MariadbConnection: {
    getConnection: vi.fn(() => ({
      insert: vi.fn(() => ({ values: insertedValues })),
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    })),
  },
}));

import {
  getPreviewPage,
  insertReadyPreviewPage,
  isDuplicatePreviewPageInsertError,
  listPreviewPages,
  listPreviewPagesForFiles,
  markPreviewPageFailed,
} from "@/lib/pdf-preview/repository";

function createPage(overrides: Partial<{
  error_message: string | null;
  file_id: string;
  id: string;
  page_number: number;
  render_version: number;
  status: "failed" | "ready";
}> = {}) {
  return {
    auth_tag: Buffer.alloc(16),
    created_at: new Date("2026-04-01T00:00:00.000Z"),
    error_message: null,
    file_id: "file-1",
    height: 1200,
    id: "preview-1",
    iv: Buffer.alloc(12),
    mime_type: "image/webp",
    page_number: 1,
    r2_key: "user-1/previews/pdf/file-1/v1/page_1.webp",
    render_version: 1,
    size: 2048,
    status: "ready" as const,
    updated_at: new Date("2026-04-01T00:00:00.000Z"),
    width: 800,
    ...overrides,
  };
}

describe("pdf preview repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limit.mockResolvedValue([createPage()]);
    thenMock.mockImplementation((onFulfilled: (value: unknown[]) => unknown) =>
      Promise.resolve([createPage()]).then(onFulfilled),
    );
    whereMock.mockReturnValue({
      limit,
      then: thenMock,
    });
    selectFrom.mockReturnValue({ where: whereMock });
    insertedValues.mockResolvedValue(undefined);
    updateWhere.mockResolvedValue(undefined);
    updateSet.mockReturnValue({ where: updateWhere });
  });

  it("gets a single preview page", async () => {
    await expect(
      getPreviewPage({
        fileId: "file-1",
        pageNumber: 1,
        renderVersion: 1,
      }),
    ).resolves.toMatchObject({
      file_id: "file-1",
      page_number: 1,
      render_version: 1,
    });
  });

  it("lists preview pages for a file and render version", async () => {
    const result = await listPreviewPages({
      fileId: "file-1",
      renderVersion: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ file_id: "file-1" });
  });

  it("inserts ready preview metadata", async () => {
    await insertReadyPreviewPage({
      authTag: Buffer.alloc(16, 1),
      fileId: "file-1",
      height: 1200,
      id: "preview-1",
      iv: Buffer.alloc(12, 2),
      mimeType: "image/webp",
      pageNumber: 1,
      r2Key: "key-1",
      renderVersion: 1,
      size: 2048,
      width: 800,
    });

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        file_id: "file-1",
        page_number: 1,
        r2_key: "key-1",
        status: "ready",
      }),
    );
  });

  it("marks an existing preview page as failed", async () => {
    await markPreviewPageFailed({
      errorMessage: "render failed",
      fileId: "file-1",
      pageNumber: 1,
      renderVersion: 1,
    });

    expect(updateSet).toHaveBeenCalledWith({
      error_message: "render failed",
      status: "failed",
    });
  });

  it("lists preview pages across multiple files", async () => {
    const result = await listPreviewPagesForFiles(["file-1", "file-2"]);

    expect(result).toHaveLength(1);
    expect(whereMock).toHaveBeenCalled();
  });

  it("detects duplicate insert errors", () => {
    expect(isDuplicatePreviewPageInsertError({ code: "ER_DUP_ENTRY" })).toBe(true);
    expect(
      isDuplicatePreviewPageInsertError({ cause: { code: "ER_DUP_ENTRY" } }),
    ).toBe(true);
    expect(isDuplicatePreviewPageInsertError(new Error("other"))).toBe(false);
  });
});
