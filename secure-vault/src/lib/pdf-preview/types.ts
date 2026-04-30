export type PdfPreviewManifestPage = {
  height: number | null;
  page: number;
  src: string;
  status: "failed" | "pending" | "ready";
  width: number | null;
};

export type PdfPreviewManifest = {
  fileId: string;
  fileName: string;
  mimeType: string;
  pageCount: number;
  pages: PdfPreviewManifestPage[];
  renderVersion: number;
};
