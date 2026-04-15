import { describe, expect, it } from "vitest";

import { buildPdfPagePlan } from "@/lib/ai/embeddings/pdf-page-plan";

describe("pdf page plan", () => {
  it("uses full-document plus per-page chunks for small pdfs", () => {
    expect(buildPdfPagePlan(3)).toEqual([
      { chunkIndex: 0, chunkType: "full", pageFrom: 1, pageTo: 3 },
      { chunkIndex: 1, chunkType: "page", pageFrom: 1, pageTo: 1 },
      { chunkIndex: 2, chunkType: "page", pageFrom: 2, pageTo: 2 },
      { chunkIndex: 3, chunkType: "page", pageFrom: 3, pageTo: 3 },
    ]);
  });

  it("uses overlapping windows plus per-page chunks for large pdfs", () => {
    expect(buildPdfPagePlan(20)).toEqual([
      { chunkIndex: 0, chunkType: "window", pageFrom: 1, pageTo: 6 },
      { chunkIndex: 1, chunkType: "window", pageFrom: 6, pageTo: 11 },
      { chunkIndex: 2, chunkType: "window", pageFrom: 11, pageTo: 16 },
      { chunkIndex: 3, chunkType: "window", pageFrom: 16, pageTo: 20 },
      { chunkIndex: 4, chunkType: "page", pageFrom: 1, pageTo: 1 },
      { chunkIndex: 5, chunkType: "page", pageFrom: 2, pageTo: 2 },
      { chunkIndex: 6, chunkType: "page", pageFrom: 3, pageTo: 3 },
      { chunkIndex: 7, chunkType: "page", pageFrom: 4, pageTo: 4 },
      { chunkIndex: 8, chunkType: "page", pageFrom: 5, pageTo: 5 },
      { chunkIndex: 9, chunkType: "page", pageFrom: 6, pageTo: 6 },
      { chunkIndex: 10, chunkType: "page", pageFrom: 7, pageTo: 7 },
      { chunkIndex: 11, chunkType: "page", pageFrom: 8, pageTo: 8 },
      { chunkIndex: 12, chunkType: "page", pageFrom: 9, pageTo: 9 },
      { chunkIndex: 13, chunkType: "page", pageFrom: 10, pageTo: 10 },
      { chunkIndex: 14, chunkType: "page", pageFrom: 11, pageTo: 11 },
      { chunkIndex: 15, chunkType: "page", pageFrom: 12, pageTo: 12 },
      { chunkIndex: 16, chunkType: "page", pageFrom: 13, pageTo: 13 },
      { chunkIndex: 17, chunkType: "page", pageFrom: 14, pageTo: 14 },
      { chunkIndex: 18, chunkType: "page", pageFrom: 15, pageTo: 15 },
      { chunkIndex: 19, chunkType: "page", pageFrom: 16, pageTo: 16 },
      { chunkIndex: 20, chunkType: "page", pageFrom: 17, pageTo: 17 },
      { chunkIndex: 21, chunkType: "page", pageFrom: 18, pageTo: 18 },
      { chunkIndex: 22, chunkType: "page", pageFrom: 19, pageTo: 19 },
      { chunkIndex: 23, chunkType: "page", pageFrom: 20, pageTo: 20 },
    ]);
  });
});
