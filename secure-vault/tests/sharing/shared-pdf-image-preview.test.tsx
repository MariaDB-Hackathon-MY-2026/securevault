import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SharedPdfImagePreview } from "@/components/share/shared-pdf-image-preview";

describe("SharedPdfImagePreview", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:pdf-preview-page"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the manifest route and renders page image urls", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.includes("/pages/")) {
        return Promise.resolve(new Response("webp", { status: 200 }));
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            fileId: "file-1",
            fileName: "report.pdf",
            mimeType: "application/pdf",
            pageCount: 2,
            pages: [
              {
                height: 1754,
                page: 1,
                src: "/api/share/share-token/pdf-preview/pages/1",
                status: "ready",
                width: 1240,
              },
              {
                height: 1754,
                page: 2,
                src: "/api/share/share-token/pdf-preview/pages/2",
                status: "ready",
                width: 1240,
              },
            ],
            renderVersion: 1,
          }),
          { status: 200 },
        ),
      );
    });

    render(<SharedPdfImagePreview token="share-token" fileName="report.pdf" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/share/share-token/pdf-preview", {
        signal: expect.any(AbortSignal),
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/share/share-token/pdf-preview/pages/1", {
        signal: expect.any(AbortSignal),
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/share/share-token/pdf-preview/pages/2", {
        signal: expect.any(AbortSignal),
      });
      expect(screen.getByTestId("shared-pdf-preview-page-image-1").tagName).toBe("DIV");
      expect(screen.getByTestId("shared-pdf-preview-page-image-2").tagName).toBe("DIV");
    });
  });

  it("blocks the pdf page image context menu", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.includes("/pages/")) {
        return Promise.resolve(new Response("webp", { status: 200 }));
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            fileId: "file-1",
            fileName: "report.pdf",
            mimeType: "application/pdf",
            pageCount: 1,
            pages: [
              {
                height: 1754,
                page: 1,
                src: "/api/share/share-token/pdf-preview/pages/1",
                status: "ready",
                width: 1240,
              },
            ],
            renderVersion: 1,
          }),
          { status: 200 },
        ),
      );
    });

    render(<SharedPdfImagePreview token="share-token" fileName="report.pdf" />);

    await waitFor(() => {
      expect(screen.getByTestId("shared-pdf-preview-page-image-1")).toBeTruthy();
    });

    expect(fireEvent.contextMenu(screen.getByTestId("shared-pdf-preview-page-image-1"))).toBe(
      false,
    );
  });

  it("preserves fileId query parameters for folder shares", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.includes("/pages/")) {
        return Promise.resolve(new Response("webp", { status: 200 }));
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            fileId: "file-1",
            fileName: "nested.pdf",
            mimeType: "application/pdf",
            pageCount: 1,
            pages: [
              {
                height: 1754,
                page: 1,
                src: "/api/share/share-token/pdf-preview/pages/1?fileId=file-1",
                status: "ready",
                width: 1240,
              },
            ],
            renderVersion: 1,
          }),
          { status: 200 },
        ),
      );
    });

    render(<SharedPdfImagePreview token="share-token" fileId="file-1" fileName="nested.pdf" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/share/share-token/pdf-preview?fileId=file-1", {
        signal: expect.any(AbortSignal),
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/share/share-token/pdf-preview/pages/1?fileId=file-1",
        {
          signal: expect.any(AbortSignal),
        },
      );
    });
  });

  it.each([
    [413, "This PDF is too large for secure preview. Use download instead."],
    [422, "This PDF cannot be rendered for secure preview. Use download instead."],
    [503, "Secure PDF preview is unavailable. Use download instead."],
  ])("shows a useful manifest error for status %s", async (status, message) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "failed" }), { status }));

    render(<SharedPdfImagePreview token="share-token" />);

    await waitFor(() => {
      expect(screen.getByText(message)).toBeTruthy();
    });
  });
});
