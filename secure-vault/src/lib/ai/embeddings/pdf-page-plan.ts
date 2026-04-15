import "server-only";

import { getSemanticConfig } from "@/lib/ai/config";
import type { EmbeddingChunkType } from "@/lib/ai/embeddings/types";

export type PdfChunkPlan = {
  chunkIndex: number;
  chunkType: EmbeddingChunkType;
  pageFrom: number;
  pageTo: number;
};

export function buildPdfPagePlan(pageCount: number): PdfChunkPlan[] {
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error("PDF page count must be a positive integer.");
  }

  const config = getSemanticConfig();
  const plans: PdfChunkPlan[] = [];
  let chunkIndex = 0;

  if (pageCount <= config.pdfFullEmbedMaxPages) {
    plans.push({
      chunkIndex,
      chunkType: "full",
      pageFrom: 1,
      pageTo: pageCount,
    });
    chunkIndex += 1;
  } else {
    const step = config.pdfWindowSizePages - config.pdfWindowOverlapPages;
    let startPage = 1;

    while (startPage <= pageCount) {
      const endPage = Math.min(startPage + config.pdfWindowSizePages - 1, pageCount);
      plans.push({
        chunkIndex,
        chunkType: "window",
        pageFrom: startPage,
        pageTo: endPage,
      });
      chunkIndex += 1;

      if (endPage === pageCount) {
        break;
      }

      startPage += step;
    }
  }

  for (let page = 1; page <= pageCount; page += 1) {
    plans.push({
      chunkIndex,
      chunkType: "page",
      pageFrom: page,
      pageTo: page,
    });
    chunkIndex += 1;
  }

  return plans;
}
