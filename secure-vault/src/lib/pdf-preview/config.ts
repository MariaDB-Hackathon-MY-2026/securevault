import "server-only";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_DPI = 144;
const DEFAULT_MAX_PAGE_IMAGE_BYTES = 2 * 1024 * 1024;
const DEFAULT_RENDER_VERSION = 1;

export type SharedPdfPreviewConfig = {
  dpi: number;
  enabled: boolean;
  maxBytes: number;
  maxPageImageBytes: number;
  maxPages: number;
  rendererPath: string;
  renderVersion: number;
};

let cachedConfig: SharedPdfPreviewConfig | null = null;

function parseBooleanFlag(value: string | undefined) {
  return value === "1" || value === "true";
}

function parsePositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsedValue = Number(rawValue);

  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsedValue;
}

export function getSharedPdfPreviewConfig(): SharedPdfPreviewConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = {
    dpi: parsePositiveIntegerEnv("SHARED_PDF_IMAGE_PREVIEW_DPI", DEFAULT_DPI),
    enabled: parseBooleanFlag(process.env.SHARED_PDF_IMAGE_PREVIEW_ENABLED?.trim()),
    maxBytes: parsePositiveIntegerEnv(
      "SHARED_PDF_IMAGE_PREVIEW_MAX_BYTES",
      DEFAULT_MAX_BYTES,
    ),
    maxPageImageBytes: parsePositiveIntegerEnv(
      "SHARED_PDF_IMAGE_PREVIEW_MAX_PAGE_IMAGE_BYTES",
      DEFAULT_MAX_PAGE_IMAGE_BYTES,
    ),
    maxPages: parsePositiveIntegerEnv(
      "SHARED_PDF_IMAGE_PREVIEW_MAX_PAGES",
      DEFAULT_MAX_PAGES,
    ),
    rendererPath: process.env.SHARED_PDF_IMAGE_PREVIEW_RENDERER_PATH?.trim() || "pdftocairo",
    renderVersion: parsePositiveIntegerEnv(
      "SHARED_PDF_IMAGE_PREVIEW_RENDER_VERSION",
      DEFAULT_RENDER_VERSION,
    ),
  };

  return cachedConfig;
}

export function resetSharedPdfPreviewConfigForTests() {
  cachedConfig = null;
}
