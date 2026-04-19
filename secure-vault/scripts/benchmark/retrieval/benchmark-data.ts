import { performance } from "node:perf_hooks";

import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { normalizeVector, serializeVector } from "../../../src/lib/ai/embeddings/vector";
import { MariadbConnection } from "../../../src/lib/db";
import { embeddingJobs, files, folders, users } from "../../../src/lib/db/schema";
import { searchHybridFiles } from "../../../src/lib/search/semantic/hybrid-search";
import { searchSemanticFiles } from "../../../src/lib/search/semantic/semantic-search";

import type { RetrievalBenchmarkConfig } from "./cli";

export type RetrievalBenchmarkMeasurement = {
  avgMs: number;
  maxMs: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  resultCountAvg: number;
  samples: number;
};

type QueryCase = {
  expectedTheme: string;
  query: string;
  queryVector: number[];
};

export type RetrievalSeedContext = {
  chunkCount: number;
  fileCount: number;
  folderCount: number;
  queryCases: QueryCase[];
  userId: string;
};

const SEARCH_LIMIT = 10;
const MAX_SCORE_GAP = 0.015;
const MIN_SIMILARITY = 0.35;

function createRng(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(rng: () => number, min: number, max: number) {
  return min + (max - min) * rng();
}

function createThemeCenter(dimensions: number, seed: number) {
  const rng = createRng(seed);
  const values = Array.from({ length: dimensions }, () => randomBetween(rng, -1, 1));
  return normalizeVector(values);
}

function jitterVector(center: number[], seed: number, amplitude: number) {
  const rng = createRng(seed);
  const values = center.map((value) => value + randomBetween(rng, -amplitude, amplitude));
  return normalizeVector(values);
}

function chunkArray<T>(items: T[], size: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

export async function seedRetrievalBenchmarkData(config: RetrievalBenchmarkConfig): Promise<RetrievalSeedContext> {
  const db = MariadbConnection.getConnection();
  const benchmarkId = nanoid(10).toLowerCase();
  const userId = `bench_${benchmarkId}`;
  const rootThemeNames = [
    "invoice",
    "contract",
    "report",
    "design",
    "policy",
    "receipt",
    "roadmap",
    "proposal",
  ];

  const themeNames = Array.from({ length: config.themeCount }, (_unused, index) =>
    rootThemeNames[index] ?? `theme-${index + 1}`,
  );

  await db.insert(users).values({
    email: `${userId}@benchmark.local`,
    email_verified: true,
    encrypted_uek: Buffer.from("bench-user-key"),
    id: userId,
    name: "Benchmark User",
    password_hash: "benchmark-password-hash",
    storage_quota: 1024 * 1024 * 1024,
    storage_used: 0,
  });

  const folderRows = themeNames.map((theme) => ({
    id: nanoid(),
    name: `Benchmark ${theme}`,
    parent_id: null,
    user_id: userId,
  }));

  await db.insert(folders).values(folderRows);

  const fileRows: Array<typeof files.$inferInsert> = [];
  const jobRows: Array<typeof embeddingJobs.$inferInsert> = [];
  const chunkRows: Array<{
    chunkIndex: number;
    chunkType: "page" | "window";
    embedding: number[];
    fileId: string;
    id: string;
    jobId: string;
    modality: "pdf";
    pageFrom: number;
    pageTo: number;
  }> = [];
  const queryCases: QueryCase[] = [];

  themeNames.forEach((theme, themeIndex) => {
    const folder = folderRows[themeIndex]!;
    const center = createThemeCenter(config.dimensions, themeIndex + 1);

    for (let fileIndex = 0; fileIndex < config.filesPerTheme; fileIndex += 1) {
      const fileId = nanoid();
      const jobId = nanoid();
      const totalChunks = config.chunksPerFile;
      const fileName = `${theme}-benchmark-${String(fileIndex + 1).padStart(4, "0")}.pdf`;

      fileRows.push({
        encrypted_fek: Buffer.from("bench-file-key"),
        folder_id: folder.id,
        has_thumbnail: false,
        id: fileId,
        mime_type: "application/pdf",
        name: fileName,
        size: 256_000,
        status: "ready",
        total_chunks: totalChunks,
        upload_completed_at: new Date(),
        upload_completed_at_approximate: false,
        user_id: userId,
      });

      jobRows.push({
        attempt_count: 1,
        completed_at: new Date(),
        embedding_dimensions: config.dimensions,
        embedding_model: "benchmark-synthetic",
        error_code: null,
        error_message: null,
        file_id: fileId,
        file_size: 256_000,
        id: jobId,
        mime_type: "application/pdf",
        modality: "pdf",
        ocr_provider: null,
        processor_id: null,
        started_at: new Date(),
        status: "ready",
        triggered_by: userId,
      });

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const pageFrom = chunkIndex + 1;
        const pageTo = pageFrom;

        chunkRows.push({
          chunkIndex,
          chunkType: chunkIndex === totalChunks - 1 && totalChunks > 1 ? "window" : "page",
          embedding: jitterVector(center, (themeIndex + 1) * 10_000 + fileIndex * 100 + chunkIndex, 0.025),
          fileId,
          id: nanoid(),
          jobId,
          modality: "pdf",
          pageFrom,
          pageTo: chunkIndex === totalChunks - 1 && totalChunks > 1 ? totalChunks : pageTo,
        });
      }
    }

    for (let queryIndex = 0; queryIndex < config.queriesPerTheme; queryIndex += 1) {
      queryCases.push({
        expectedTheme: theme,
        query: theme,
        queryVector: jitterVector(center, 900_000 + themeIndex * 100 + queryIndex, 0.01),
      });
    }
  });

  for (const batch of chunkArray(fileRows, config.fileBatchSize)) {
    await db.insert(files).values(batch);
  }

  for (const batch of chunkArray(jobRows, config.fileBatchSize)) {
    await db.insert(embeddingJobs).values(batch);
  }

  for (const batch of chunkArray(chunkRows, config.chunkBatchSize)) {
    const valueSql = batch.map((row) => sql`
      (
        ${row.id},
        ${row.jobId},
        ${row.fileId},
        ${row.chunkIndex},
        ${row.chunkType},
        ${row.modality},
        ${row.pageFrom},
        ${row.pageTo},
        null,
        null,
        null,
        null,
        VEC_FromText(${serializeVector(row.embedding)})
      )
    `);

    await db.execute(sql`
      insert into embedding_chunks
      (
        id,
        job_id,
        file_id,
        chunk_index,
        chunk_type,
        modality,
        page_from,
        page_to,
        char_count,
        encrypted_text,
        text_iv,
        text_auth_tag,
        embedding
      )
      values ${sql.join(valueSql, sql`, `)}
    `);
  }

  return {
    chunkCount: chunkRows.length,
    fileCount: fileRows.length,
    folderCount: folderRows.length,
    queryCases,
    userId,
  };
}

export async function cleanupRetrievalBenchmarkData(userId: string) {
  const db = MariadbConnection.getConnection();
  await db.delete(users).where(eq(users.id, userId));
}

export async function runSemanticSearchCase(userId: string, queryCase: QueryCase, queryTopK: number) {
  return searchSemanticFiles({
    limit: SEARCH_LIMIT,
    maxScoreGap: MAX_SCORE_GAP,
    minSimilarity: MIN_SIMILARITY,
    queryTopK,
    queryVector: queryCase.queryVector,
    userId,
  });
}

export async function runHybridSearchCase(userId: string, queryCase: QueryCase, queryTopK: number) {
  return searchHybridFiles({
    limit: SEARCH_LIMIT,
    maxScoreGap: MAX_SCORE_GAP,
    minSimilarity: MIN_SIMILARITY,
    query: queryCase.query,
    queryTopK,
    queryVector: queryCase.queryVector,
    userId,
  });
}

export function summarizeMeasurements(measurements: Array<{ durationMs: number; resultCount: number }>): RetrievalBenchmarkMeasurement {
  const durations = measurements.map((entry) => entry.durationMs).sort((left, right) => left - right);
  const resultCounts = measurements.map((entry) => entry.resultCount);
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);
  const totalResults = resultCounts.reduce((sum, value) => sum + value, 0);

  function percentile(ratio: number) {
    const index = Math.min(
      durations.length - 1,
      Math.max(0, Math.ceil(durations.length * ratio) - 1),
    );
    return durations[index] ?? 0;
  }

  return {
    avgMs: totalDuration / durations.length,
    maxMs: durations[durations.length - 1] ?? 0,
    minMs: durations[0] ?? 0,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    resultCountAvg: totalResults / resultCounts.length,
    samples: durations.length,
  };
}

export async function measureRetrievalLatency(
  seeded: RetrievalSeedContext,
  config: RetrievalBenchmarkConfig,
) {
  for (let index = 0; index < config.warmupRuns; index += 1) {
    const queryCase = seeded.queryCases[index % seeded.queryCases.length]!;
    await runSemanticSearchCase(seeded.userId, queryCase, config.queryTopK);
    await runHybridSearchCase(seeded.userId, queryCase, config.queryTopK);
  }

  const semanticMeasurements: Array<{ durationMs: number; resultCount: number }> = [];
  const hybridMeasurements: Array<{ durationMs: number; resultCount: number }> = [];

  for (const queryCase of seeded.queryCases) {
    const semanticStart = performance.now();
    const semanticResults = await runSemanticSearchCase(seeded.userId, queryCase, config.queryTopK);
    semanticMeasurements.push({
      durationMs: performance.now() - semanticStart,
      resultCount: semanticResults.length,
    });

    const hybridStart = performance.now();
    const hybridResults = await runHybridSearchCase(seeded.userId, queryCase, config.queryTopK);
    hybridMeasurements.push({
      durationMs: performance.now() - hybridStart,
      resultCount: hybridResults.length,
    });
  }

  return {
    hybrid: summarizeMeasurements(hybridMeasurements),
    semantic: summarizeMeasurements(semanticMeasurements),
  };
}
