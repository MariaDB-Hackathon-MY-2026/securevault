import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSharedPdfPreviewConfig,
  resolveSharedPdfPreviewRendererPath,
  resetSharedPdfPreviewConfigForTests,
} from "@/lib/pdf-preview/config";

describe("shared pdf preview config", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VITEST", "true");
    delete process.env.SHARED_PDF_IMAGE_PREVIEW_ENABLED;
    delete process.env.SHARED_PDF_IMAGE_PREVIEW_DPI;
    delete process.env.SHARED_PDF_IMAGE_PREVIEW_MAX_BYTES;
    delete process.env.SHARED_PDF_IMAGE_PREVIEW_MAX_PAGE_IMAGE_BYTES;
    delete process.env.SHARED_PDF_IMAGE_PREVIEW_MAX_PAGES;
    delete process.env.SHARED_PDF_IMAGE_PREVIEW_RENDERER_PATH;
    delete process.env.SHARED_PDF_IMAGE_PREVIEW_RENDER_VERSION;
    resetSharedPdfPreviewConfigForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetSharedPdfPreviewConfigForTests();
  });

  it("is disabled by default", () => {
    expect(getSharedPdfPreviewConfig()).toEqual({
      dpi: 144,
      enabled: false,
      maxBytes: 25 * 1024 * 1024,
      maxPageImageBytes: 2 * 1024 * 1024,
      maxPages: 100,
      rendererPath: "pdftocairo",
      renderVersion: 1,
    });
  });

  it("parses enabled mode and numeric overrides", () => {
    process.env.SHARED_PDF_IMAGE_PREVIEW_ENABLED = "true";
    process.env.SHARED_PDF_IMAGE_PREVIEW_DPI = "200";
    process.env.SHARED_PDF_IMAGE_PREVIEW_MAX_BYTES = "12345";
    process.env.SHARED_PDF_IMAGE_PREVIEW_MAX_PAGE_IMAGE_BYTES = "67890";
    process.env.SHARED_PDF_IMAGE_PREVIEW_MAX_PAGES = "25";
    process.env.SHARED_PDF_IMAGE_PREVIEW_RENDERER_PATH = "C:\\Tools\\poppler\\pdftocairo.exe";
    process.env.SHARED_PDF_IMAGE_PREVIEW_RENDER_VERSION = "3";
    resetSharedPdfPreviewConfigForTests();

    expect(getSharedPdfPreviewConfig()).toEqual({
      dpi: 200,
      enabled: true,
      maxBytes: 12345,
      maxPageImageBytes: 67890,
      maxPages: 25,
      rendererPath: "C:\\Tools\\poppler\\pdftocairo.exe",
      renderVersion: 3,
    });
  });

  it("falls back to pdftocairo for a Windows-only renderer path on non-Windows runtimes", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(
      resolveSharedPdfPreviewRendererPath(
        "C:\\Tools\\poppler\\pdftocairo.exe",
        "linux",
      ),
    ).toBe("pdftocairo");
    expect(warnSpy).toHaveBeenCalledWith(
      "Ignoring Windows-only SHARED_PDF_IMAGE_PREVIEW_RENDERER_PATH on non-Windows runtime; falling back to pdftocairo.",
    );
  });

  it("keeps the explicit renderer path on Windows runtimes", () => {
    expect(
      resolveSharedPdfPreviewRendererPath(
        "C:\\Tools\\poppler\\pdftocairo.exe",
        "win32",
      ),
    ).toBe("C:\\Tools\\poppler\\pdftocairo.exe");
  });

  it("rejects invalid integer env values", () => {
    process.env.SHARED_PDF_IMAGE_PREVIEW_MAX_PAGES = "abc";
    resetSharedPdfPreviewConfigForTests();

    expect(() => getSharedPdfPreviewConfig()).toThrow(
      "SHARED_PDF_IMAGE_PREVIEW_MAX_PAGES must be a positive integer.",
    );
  });

  it("rejects zero and negative numeric values", () => {
    process.env.SHARED_PDF_IMAGE_PREVIEW_DPI = "0";
    resetSharedPdfPreviewConfigForTests();

    expect(() => getSharedPdfPreviewConfig()).toThrow(
      "SHARED_PDF_IMAGE_PREVIEW_DPI must be a positive integer.",
    );
  });
});
