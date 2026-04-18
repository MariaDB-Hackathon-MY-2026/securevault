import "server-only";

import { PDFDocument } from "pdf-lib";

import { EmbeddingError } from "@/lib/ai/embeddings/errors";
import { buildPdfPagePlan } from "@/lib/ai/embeddings/pdf-page-plan";
import type { EmbeddingChunkPayload } from "@/lib/ai/embeddings/types";

async function createPdfSlice(source: PDFDocument, pageFrom: number, pageTo: number) {
  const nextDocument = await PDFDocument.create();
  const pageIndexes = Array.from(
    { length: pageTo - pageFrom + 1 },
    (_unused, offset) => pageFrom - 1 + offset,
  );
  const pages = await nextDocument.copyPages(source, pageIndexes);

  for (const page of pages) {
    nextDocument.addPage(page);
  }

  return Buffer.from(await nextDocument.save());
}

export async function splitPdfForEmbedding(input: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<EmbeddingChunkPayload[]> {
  try {
    const document = await PDFDocument.load(input.bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const plan = buildPdfPagePlan(document.getPageCount());

    return Promise.all(
      plan.map(async (item) => ({
        bytes: await createPdfSlice(document, item.pageFrom, item.pageTo),
        chunkIndex: item.chunkIndex,
        chunkType: item.chunkType,
        contextLabel: item.chunkType === "page"
          ? `${input.fileName} pages ${item.pageFrom}-${item.pageTo}`
          : `${input.fileName} pages ${item.pageFrom}-${item.pageTo}`,
        mimeType: input.mimeType,
        pageFrom: item.pageFrom,
        pageTo: item.pageTo,
      })),
    );
  } catch (error) {
    throw new EmbeddingError("PDF_PARSE_FAILED", "Failed to parse PDF bytes for semantic indexing.", {
      cause: error,
      retryable: false,
    });
  }
}
