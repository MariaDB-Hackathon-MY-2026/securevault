import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { expect, type Page } from "./e2e-test";
import { MariadbConnection } from "../../../src/lib/db";
import { embeddingChunks, embeddingJobs, files } from "../../../src/lib/db/schema";

type EmbeddingModality = "image" | "pdf";
type EmbeddingChunkType = "full" | "page" | "window";
type PersistedJobStatus = "failed" | "processing" | "queued" | "ready" | "skipped";

type FileRecord = {
  id: string;
  mimeType: string;
  size: number;
  userId: string;
};

type SemanticJobStatusItem = {
  errorCode: string | null;
  errorMessage: string | null;
  modality: EmbeddingModality;
  retryable: boolean;
  status: PersistedJobStatus;
};

const VECTOR_DIMENSIONS = 1536;
const TOKEN_DIMENSIONS = 256;
const SEMANTIC_STATUS_TIMEOUT_MS = process.env.PLAYWRIGHT_SEMANTIC_STATUS_TIMEOUT_MS?.trim()
  ? Number.parseInt(process.env.PLAYWRIGHT_SEMANTIC_STATUS_TIMEOUT_MS, 10)
  : 180_000;
const SEMANTIC_STATUS_POLL_INTERVAL_MS = 1_000;

function formatSemanticQuery(query: string) {
  return `task: search result | query: ${query.trim()}`;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function tokenToBucket(token: string) {
  const digest = createHash("sha256").update(token).digest();
  return digest.readUInt16BE(0) % TOKEN_DIMENSIONS;
}

function addHashedSignal(vector: number[], input: string, weight: number) {
  const digest = createHash("sha256").update(input).digest();

  for (let index = 0; index < digest.length; index += 1) {
    const bucket = digest[index] % vector.length;
    const signedValue = (digest[index] / 255) * 2 - 1;
    vector[bucket] += signedValue * weight;
  }
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.hypot(...vector);
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Cannot normalize an empty semantic test vector.");
  }

  return vector.map((value) => value / magnitude);
}

function createSemanticQueryVector(query: string) {
  const formattedQuery = formatSemanticQuery(query);
  const vector = new Array<number>(VECTOR_DIMENSIONS).fill(0);

  for (const token of tokenize(formattedQuery)) {
    vector[tokenToBucket(token)] += 1;
  }

  addHashedSignal(vector, `text:${formattedQuery}`, 0.25);
  return normalizeVector(vector);
}

async function getOwnedFileRecord(fileId: string): Promise<FileRecord> {
  const db = MariadbConnection.getConnection();
  const [file] = await db
    .select({
      id: files.id,
      mimeType: files.mime_type,
      size: files.size,
      userId: files.user_id,
    })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  if (!file) {
    throw new Error(`File ${fileId} was not found while preparing semantic test data.`);
  }

  return file;
}

async function upsertEmbeddingJob(input: {
  file: FileRecord;
  modality: EmbeddingModality;
  status: PersistedJobStatus;
  errorCode: string | null;
  errorMessage: string | null;
}) {
  const db = MariadbConnection.getConnection();
  const now = new Date();
  const [existingJob] = await db
    .select({
      id: embeddingJobs.id,
    })
    .from(embeddingJobs)
    .where(
      and(
        eq(embeddingJobs.file_id, input.file.id),
        eq(embeddingJobs.modality, input.modality),
      ),
    )
    .limit(1);

  if (existingJob) {
    await db
      .update(embeddingJobs)
      .set({
        completed_at: input.status === "ready" || input.status === "failed" || input.status === "skipped"
          ? now
          : null,
        error_code: input.errorCode,
        error_message: input.errorMessage,
        started_at: input.status === "processing" ? now : null,
        status: input.status,
        updated_at: now,
      })
      .where(eq(embeddingJobs.id, existingJob.id));

    return existingJob.id;
  }

  const jobId = nanoid();
  await db.insert(embeddingJobs).values({
    attempt_count: input.status === "failed" ? 1 : 0,
    completed_at: input.status === "ready" || input.status === "failed" || input.status === "skipped"
      ? now
      : null,
    created_at: now,
    embedding_dimensions: 1536,
    embedding_model: "playwright-fake-provider",
    error_code: input.errorCode,
    error_message: input.errorMessage,
    file_id: input.file.id,
    file_size: input.file.size,
    id: jobId,
    mime_type: input.file.mimeType,
    modality: input.modality,
    started_at: input.status === "processing" ? now : null,
    status: input.status,
    triggered_by: input.file.userId,
    updated_at: now,
  });

  return jobId;
}

export async function getFileIdByName(page: Page, fileName: string) {
  const result = await page.evaluate(async (targetName) => {
    const response = await fetch("/api/files", { credentials: "same-origin" });
    const payload = (await response.json()) as {
      files: Array<{ id: string; name: string }>;
    };

    return payload.files.find((file) => file.name === targetName)?.id ?? null;
  }, fileName);

  expect(result).not.toBeNull();
  return result as string;
}

export async function fetchSemanticJobs(page: Page, fileId: string) {
  return page.evaluate(async (targetFileId) => {
    const response = await fetch(`/api/embeddings/${encodeURIComponent(targetFileId)}`, {
      credentials: "same-origin",
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Unexpected semantic status ${response.status}`);
    }

    const payload = await response.json() as {
      jobs: SemanticJobStatusItem[];
    };

    return payload.jobs;
  }, fileId);
}

export async function waitForSemanticJobStatus(input: {
  expectedStatus: PersistedJobStatus;
  fileId: string;
  modality: EmbeddingModality;
  page: Page;
  timeoutMs?: number;
}) {
  await expect
    .poll(async () => {
      const jobs = await fetchSemanticJobs(input.page, input.fileId);
      return jobs.find((job) => job.modality === input.modality)?.status ?? null;
    }, {
      intervals: [SEMANTIC_STATUS_POLL_INTERVAL_MS],
      timeout: input.timeoutMs ?? SEMANTIC_STATUS_TIMEOUT_MS,
    })
    .toBe(input.expectedStatus);
}

export async function upsertReadySemanticMatch(input: {
  chunkType: EmbeddingChunkType;
  fileId: string;
  modality: EmbeddingModality;
  pageFrom: number | null;
  pageTo: number | null;
  query: string;
}) {
  const db = MariadbConnection.getConnection();
  const file = await getOwnedFileRecord(input.fileId);
  const embedding = createSemanticQueryVector(input.query);
  const jobId = await upsertEmbeddingJob({
    errorCode: null,
    errorMessage: null,
    file,
    modality: input.modality,
    status: "ready",
  });

  await db.delete(embeddingChunks).where(eq(embeddingChunks.job_id, jobId));
  await db.insert(embeddingChunks).values({
    chunk_index: 0,
    chunk_type: input.chunkType,
    embedding: sql`VEC_FromText(${JSON.stringify(embedding)})`,
    file_id: file.id,
    id: nanoid(),
    job_id: jobId,
    modality: input.modality,
    page_from: input.pageFrom,
    page_to: input.pageTo,
  });

  return jobId;
}

export async function markSemanticJobFailed(input: {
  errorCode: string;
  errorMessage: string;
  fileId: string;
  modality: EmbeddingModality;
}) {
  const db = MariadbConnection.getConnection();
  const file = await getOwnedFileRecord(input.fileId);
  const jobId = await upsertEmbeddingJob({
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    file,
    modality: input.modality,
    status: "failed",
  });

  await db.delete(embeddingChunks).where(eq(embeddingChunks.job_id, jobId));
  return jobId;
}

export async function createPdfUploadPayload(input:
  | {
    name: string;
    pageCount: number;
    pageTextPrefix: string;
  }
  | {
    name: string;
    pageTexts: string[];
  }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pageTexts = "pageTexts" in input
    ? input.pageTexts
    : Array.from(
      { length: input.pageCount },
      (_unused, index) => `${input.pageTextPrefix} page ${index + 1}`,
    );

  for (const pageText of pageTexts) {
    const page = pdf.addPage([612, 792]);
    page.drawText(pageText, {
      font,
      size: 24,
      x: 72,
      y: 720,
    });
  }

  return {
    buffer: Buffer.from(await pdf.save()),
    mimeType: "application/pdf",
    name: input.name,
  } as const;
}
