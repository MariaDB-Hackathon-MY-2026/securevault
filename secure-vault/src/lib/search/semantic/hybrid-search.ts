import "server-only";

import { canPreviewMime } from "@/lib/files/preview";
import { searchFilesByFilename } from "@/lib/search/filename-search";
import { searchSemanticFiles } from "@/lib/search/semantic/semantic-search";
import type { FilenameSearchResult, SemanticSearchResult, SemanticSearchSource } from "@/lib/search/types";

const HYBRID_CANDIDATE_FLOOR = 25;
const HYBRID_MAX_LIMIT = 50;
const HYBRID_RRF_K = 60;

type HybridCandidate = {
  fusedScore: number;
  result: SemanticSearchResult;
};

function getHybridCandidateLimit(limit: number) {
  return Math.min(Math.max(limit * 3, HYBRID_CANDIDATE_FLOOR), HYBRID_MAX_LIMIT);
}

function getReciprocalRankFusionScore(rank: number) {
  return 1 / (HYBRID_RRF_K + rank + 1);
}

function toHybridFilenameResult(result: FilenameSearchResult): SemanticSearchResult {
  return {
    canPreview: canPreviewMime(result.mimeType),
    fileId: result.id,
    folderId: result.folderId,
    folderPath: result.folderPath,
    isInRoot: result.isInRoot,
    matchType: "filename",
    mimeType: result.mimeType,
    name: result.name,
    pageFrom: null,
    pageTo: null,
    retrievalSources: ["filename"],
    score: 0,
    size: result.size,
    updatedAt: result.updatedAt,
  };
}

function mergeSources(
  currentSources: SemanticSearchSource[],
  nextSource: SemanticSearchSource,
) {
  return currentSources.includes(nextSource)
    ? currentSources
    : [...currentSources, nextSource].sort();
}

function compareHybridCandidates(left: HybridCandidate, right: HybridCandidate) {
  if (left.fusedScore !== right.fusedScore) {
    return right.fusedScore - left.fusedScore;
  }

  if (left.result.score !== right.result.score) {
    return right.result.score - left.result.score;
  }

  const updatedAtDelta =
    new Date(right.result.updatedAt).getTime() - new Date(left.result.updatedAt).getTime();
  if (updatedAtDelta !== 0) {
    return updatedAtDelta;
  }

  return left.result.fileId.localeCompare(right.result.fileId);
}

export async function searchHybridFiles(input: {
  limit: number;
  maxScoreGap: number;
  minSimilarity: number;
  query: string;
  queryTopK: number;
  queryVector: number[];
  userId: string;
}): Promise<SemanticSearchResult[]> {
  const candidateLimit = getHybridCandidateLimit(input.limit);
  const [semanticResults, filenameResults] = await Promise.all([
    searchSemanticFiles({
      limit: candidateLimit,
      maxScoreGap: input.maxScoreGap,
      minSimilarity: input.minSimilarity,
      queryTopK: input.queryTopK,
      queryVector: input.queryVector,
      userId: input.userId,
    }),
    searchFilesByFilename({
      limit: candidateLimit,
      query: input.query,
      userId: input.userId,
    }),
  ]);

  const candidates = new Map<string, HybridCandidate>();

  semanticResults.forEach((result, index) => {
    candidates.set(result.fileId, {
      fusedScore: getReciprocalRankFusionScore(index),
      result,
    });
  });

  filenameResults.forEach((result, index) => {
    const fusedScore = getReciprocalRankFusionScore(index);
    const current = candidates.get(result.id);
    if (!current) {
      candidates.set(result.id, {
        fusedScore,
        result: toHybridFilenameResult(result),
      });
      return;
    }

    candidates.set(result.id, {
      fusedScore: current.fusedScore + fusedScore,
      result: {
        ...current.result,
        retrievalSources: mergeSources(current.result.retrievalSources, "filename"),
      },
    });
  });

  return [...candidates.values()]
    .sort(compareHybridCandidates)
    .slice(0, input.limit)
    .map((candidate) => candidate.result);
}
