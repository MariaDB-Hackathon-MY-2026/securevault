import { performance } from "node:perf_hooks";

import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { embedBinaryForRetrieval } from "../../../src/lib/ai/embeddings/embedder";
import { splitPdfForEmbedding } from "../../../src/lib/ai/embeddings/pdf-splitter";
import { getSemanticConfig } from "../../../src/lib/ai/config";
import { MariadbConnection } from "../../../src/lib/db";
import { embeddingJobs, files, folders, users } from "../../../src/lib/db/schema";
import { searchHybridFiles } from "../../../src/lib/search/semantic/hybrid-search";
import { embedSemanticQuery } from "../../../src/lib/search/semantic/query-embedder";
import { searchSemanticFiles } from "../../../src/lib/search/semantic/semantic-search";

import type { BenchmarkSuiteName, PipelineBenchmarkConfig } from "./cli";

type AnchorDefinition = {
  controlledQuery: string;
  documentText: string;
  stressDecoys: string[];
  stressQuery: string;
  stressTargetText: string;
  supportingText: string;
};

type ThemeDefinition = {
  anchors: AnchorDefinition[];
  name: string;
  summary: string;
};

type IndexedDocument = {
  fileId: string;
  query: string;
  suite: BenchmarkSuiteName;
  theme: string;
};

export type SeededPipelineContext = {
  documents: IndexedDocument[];
  fileCount: number;
  indexingTimesMs: number[];
  suite: BenchmarkSuiteName;
  userId: string;
};

export type AccuracyMetrics = {
  averageSearchTimeMs: number;
  mrr: number;
  samples: number;
  top1Accuracy: number;
  top3Recall: number;
};

export type SuiteResult = {
  hybrid: AccuracyMetrics;
  indexingSummary: { avg: number; p50: number; p95: number };
  seeded: SeededPipelineContext;
  semantic: AccuracyMetrics;
};

const SEARCH_LIMIT = 10;
const MAX_SCORE_GAP = 0.015;
const MIN_SIMILARITY = 0.35;

const STRESS_SHARED_OVERLAP_TEXT =
  "Shared policy language mentions approval requests, compliance review, access checks, audit evidence, reimbursement rules, onboarding notes, incident follow-up, and vendor exceptions.";

const THEMES: ThemeDefinition[] = [
  {
    name: "finance",
    summary: "budget governance, reimbursement controls, and expense approvals",
    anchors: [
      {
        controlledQuery: "meal reimbursement receipts for regional sales teams after client travel",
        documentText:
          "Regional sales teams must submit meal reimbursement receipts within five business days after client travel.",
        stressQuery:
          "for salespeople visiting clients, when are meal reimbursement receipts due",
        stressDecoys: [
          "Regional sales teams must submit meal reimbursement receipts within ten business days after internal training.",
          "Regional sales teams must submit hotel reimbursement receipts within five business days after client travel.",
        ],
        stressTargetText:
          "Regional sales teams must submit meal reimbursement receipts within five business days after client travel.",
        supportingText:
          "Managers review reimbursement exceptions during the weekly finance triage meeting.",
      },
      {
        controlledQuery: "marketing campaign budget variance review above eight percent",
        documentText:
          "Quarterly budget variance reviews flag any marketing campaign that exceeds forecast by more than eight percent.",
        stressQuery:
          "what level of marketing overspend triggers a finance variance review",
        stressDecoys: [
          "Quarterly budget variance reviews flag any marketing campaign that exceeds forecast by more than twelve percent.",
          "Quarterly budget variance reviews flag any product launch program that exceeds forecast by more than eight percent.",
        ],
        stressTargetText:
          "Quarterly budget variance reviews flag any marketing campaign that exceeds forecast by more than eight percent.",
        supportingText:
          "The finance lead records approved variance notes in the monthly close packet.",
      },
      {
        controlledQuery: "director approval needed before laptop refresh purchase order",
        documentText:
          "Laptop refresh purchases above the procurement threshold require director approval before a purchase order is issued.",
        stressQuery:
          "who has to approve laptop refresh purchases before a purchase order is created",
        stressDecoys: [
          "Laptop refresh purchases above the procurement threshold require manager approval before a purchase order is issued.",
          "Laptop refresh purchases above the procurement threshold require director approval before vendor payment is released.",
        ],
        stressTargetText:
          "Laptop refresh purchases above the procurement threshold require director approval before a purchase order is issued.",
        supportingText:
          "Procurement approvals are rechecked before vendor payment is released.",
      },
    ],
  },
  {
    name: "legal",
    summary: "contract review, signature controls, and policy exceptions",
    anchors: [
      {
        controlledQuery: "legal counsel review for vendor agreements with automatic renewal",
        documentText:
          "Vendor agreements that include automatic renewal terms must be reviewed by legal counsel before signature.",
        stressQuery:
          "which vendor agreements need legal review before signing because they renew automatically",
        stressDecoys: [
          "Vendor agreements that include automatic renewal terms must be reviewed by procurement before signature.",
          "Vendor agreements that include unlimited liability terms must be reviewed by legal counsel before signature.",
        ],
        stressTargetText:
          "Vendor agreements that include automatic renewal terms must be reviewed by legal counsel before signature.",
        supportingText:
          "Renewal language is tracked in the obligations register after execution.",
      },
      {
        controlledQuery: "privacy sign off when a subprocesser is introduced in a data processing addendum",
        documentText:
          "Customer data processing addenda require a privacy sign-off whenever a subprocesser is introduced.",
        stressQuery:
          "when is a privacy sign off required in a customer data processing addendum",
        stressDecoys: [
          "Customer data processing addenda require a legal sign-off whenever a subprocesser is introduced.",
          "Customer data processing addenda require a privacy sign-off whenever international data transfers are introduced.",
        ],
        stressTargetText:
          "Customer data processing addenda require a privacy sign-off whenever a subprocesser is introduced.",
        supportingText:
          "Legal maintains a revision log for each negotiated subprocesser clause.",
      },
      {
        controlledQuery: "approval memo summary for material contract deviations",
        documentText:
          "Material contract deviations must be summarized in the approval memo before the commercial team can proceed.",
        stressQuery:
          "what must be summarized before the commercial team can move ahead with major contract changes",
        stressDecoys: [
          "Material contract deviations must be summarized in the negotiation memo before the commercial team can proceed.",
          "Material pricing deviations must be summarized in the approval memo before the commercial team can proceed.",
        ],
        stressTargetText:
          "Material contract deviations must be summarized in the approval memo before the commercial team can proceed.",
        supportingText:
          "The commercial owner attaches deviation notes to the final negotiation package.",
      },
    ],
  },
  {
    name: "operations",
    summary: "incident response, facility readiness, and service continuity",
    anchors: [
      {
        controlledQuery: "warehouse generator testing for cold storage continuity on the first Tuesday",
        documentText:
          "Warehouse generators are tested on the first Tuesday of every month to confirm cold-storage continuity.",
        stressQuery:
          "when are warehouse backup generators tested to keep cold storage running",
        stressDecoys: [
          "Warehouse generators are tested on the first Friday of every month to confirm cold-storage continuity.",
          "Warehouse generators are tested on the first Tuesday of every month to confirm loading-bay continuity.",
        ],
        stressTargetText:
          "Warehouse generators are tested on the first Tuesday of every month to confirm cold-storage continuity.",
        supportingText:
          "Maintenance teams archive the generator checklist after each drill.",
      },
      {
        controlledQuery: "escalate outage affecting barcode scanners for more than fifteen minutes",
        documentText:
          "Incident commanders escalate any outage affecting barcode scanners for more than fifteen minutes.",
        stressQuery:
          "after how long does a barcode scanner outage have to be escalated",
        stressDecoys: [
          "Incident commanders escalate any outage affecting barcode scanners for more than thirty minutes.",
          "Incident commanders escalate any outage affecting loading dock tablets for more than fifteen minutes.",
        ],
        stressTargetText:
          "Incident commanders escalate any outage affecting barcode scanners for more than fifteen minutes.",
        supportingText:
          "Scanner incident summaries are included in the weekly operations retrospective.",
      },
      {
        controlledQuery: "loading dock traffic rerouted during severe weather wind alerts",
        documentText:
          "Loading dock traffic is rerouted during severe weather whenever wind alerts cross the safety threshold.",
        stressQuery:
          "what triggers rerouting loading dock traffic during severe weather",
        stressDecoys: [
          "Loading dock traffic is rerouted during severe weather whenever lightning alerts cross the safety threshold.",
          "Delivery yard traffic is rerouted during severe weather whenever wind alerts cross the safety threshold.",
        ],
        stressTargetText:
          "Loading dock traffic is rerouted during severe weather whenever wind alerts cross the safety threshold.",
        supportingText:
          "Facility supervisors log each reroute decision in the operations journal.",
      },
    ],
  },
  {
    name: "hr",
    summary: "employee onboarding, benefits guidance, and performance support",
    anchors: [
      {
        controlledQuery: "benefits enrollment guidance during first week onboarding workshop",
        documentText:
          "New hires receive benefits enrollment guidance during the first-week onboarding workshop led by people operations.",
        stressQuery:
          "when do new hires get benefits enrollment guidance during onboarding",
        stressDecoys: [
          "New hires receive benefits enrollment guidance during the second-week onboarding workshop led by people operations.",
          "New hires receive payroll enrollment guidance during the first-week onboarding workshop led by people operations.",
        ],
        stressTargetText:
          "New hires receive benefits enrollment guidance during the first-week onboarding workshop led by people operations.",
        supportingText:
          "People operations tracks workshop attendance in the onboarding dashboard.",
      },
      {
        controlledQuery: "documented check in cadence for performance improvement plans",
        documentText:
          "Performance improvement plans require a documented check-in cadence agreed by the manager and HR partner.",
        stressQuery:
          "what check in schedule must be documented for a performance improvement plan",
        stressDecoys: [
          "Performance improvement plans require a documented escalation cadence agreed by the manager and HR partner.",
          "Performance improvement plans require a documented check-in cadence agreed by the manager and department lead.",
        ],
        stressTargetText:
          "Performance improvement plans require a documented check-in cadence agreed by the manager and HR partner.",
        supportingText:
          "HR partners review progress notes before each milestone checkpoint.",
      },
      {
        controlledQuery: "home office policy acknowledgment before remote work equipment stipend reimbursement",
        documentText:
          "Remote work equipment stipends are reimbursed only after the employee signs the home office policy acknowledgment.",
        stressQuery:
          "what has to be signed before a remote equipment stipend can be reimbursed",
        stressDecoys: [
          "Remote work equipment stipends are reimbursed only after the employee signs the information security acknowledgment.",
          "Remote work equipment stipends are reimbursed only after the manager signs the home office policy acknowledgment.",
        ],
        stressTargetText:
          "Remote work equipment stipends are reimbursed only after the employee signs the home office policy acknowledgment.",
        supportingText:
          "The reimbursement queue validates signed acknowledgments before payment.",
      },
    ],
  },
  {
    name: "security",
    summary: "access control, incident handling, and audit readiness",
    anchors: [
      {
        controlledQuery: "team lead certification of administrator accounts every quarter",
        documentText:
          "Privileged access reviews require team leads to certify administrator accounts every quarter.",
        stressQuery:
          "how often do team leads need to certify administrator accounts",
        stressDecoys: [
          "Privileged access reviews require team leads to certify administrator accounts every month.",
          "Privileged access reviews require team leads to certify service accounts every quarter.",
        ],
        stressTargetText:
          "Privileged access reviews require team leads to certify administrator accounts every quarter.",
        supportingText:
          "Security operations archives certification evidence for the audit binder.",
      },
      {
        controlledQuery: "mandatory password rotation within one hour after phishing credential submission",
        documentText:
          "Phishing incidents with credential submission trigger mandatory password rotation within one hour.",
        stressQuery:
          "after credentials are entered into a phishing site, how quickly must passwords be rotated",
        stressDecoys: [
          "Phishing incidents with credential submission trigger mandatory password rotation within four hours.",
          "Phishing incidents with malware attachment opening trigger mandatory password rotation within one hour.",
        ],
        stressTargetText:
          "Phishing incidents with credential submission trigger mandatory password rotation within one hour.",
        supportingText:
          "The incident commander records password reset completion in the response log.",
      },
      {
        controlledQuery: "retain third party audit evidence in the control library until remediation closes",
        documentText:
          "Third-party audit evidence must be retained in the control library until the remediation window closes.",
        stressQuery:
          "where must third party audit evidence remain until remediation is closed",
        stressDecoys: [
          "Third-party audit evidence must be retained in the audit inbox until the remediation window closes.",
          "Third-party audit evidence must be retained in the control library until the review window closes.",
        ],
        stressTargetText:
          "Third-party audit evidence must be retained in the control library until the remediation window closes.",
        supportingText:
          "Compliance staff annotate each retained artifact with the remediation reference.",
      },
    ],
  },
];

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatSuiteName(suite: BenchmarkSuiteName) {
  return suite === "controlled" ? "Controlled" : "Stress";
}

export function getSuiteDescription(suite: BenchmarkSuiteName) {
  return suite === "controlled"
    ? "Curated benchmark with direct topic phrasing and clean topical separation."
    : "Harder benchmark with paraphrased queries and deliberately overlapping policy vocabulary across documents.";
}

function selectThemes(themeCount: number) {
  if (themeCount > THEMES.length) {
    throw new Error(`Requested ${themeCount} themes, but only ${THEMES.length} benchmark themes are defined.`);
  }

  return THEMES.slice(0, themeCount);
}

async function createPdfBytes(pageTexts: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const pageText of pageTexts) {
    const page = pdf.addPage([612, 792]);
    page.drawText(pageText, {
      font,
      lineHeight: 28,
      maxWidth: 470,
      size: 22,
      x: 72,
      y: 700,
    });
  }

  return Buffer.from(await pdf.save());
}

function buildPageTexts(
  suite: BenchmarkSuiteName,
  theme: ThemeDefinition,
  anchor: AnchorDefinition,
  variantText?: string,
) {
  if (suite === "controlled") {
    return [
      `Benchmark theme: ${theme.name}. This document covers ${theme.summary}.`,
      anchor.documentText,
      anchor.supportingText,
    ];
  }

  return [
    `Benchmark theme: ${theme.name}. This document covers ${theme.summary}. ${STRESS_SHARED_OVERLAP_TEXT}`,
    "This policy packet shares common language around approvals, compliance review, access checks, remediation, exceptions, and audit evidence.",
    anchor.supportingText,
    variantText ?? anchor.stressTargetText,
  ];
}

function getQueryForSuite(suite: BenchmarkSuiteName, anchor: AnchorDefinition) {
  return suite === "controlled" ? anchor.controlledQuery : anchor.stressQuery;
}

export async function seedAndIndexDocuments(
  config: PipelineBenchmarkConfig,
  suite: BenchmarkSuiteName,
): Promise<SeededPipelineContext> {
  const db = MariadbConnection.getConnection();
  const benchmarkId = nanoid(10).toLowerCase();
  const userId = nanoid();
  const selectedThemes = selectThemes(config.themeCount);
  const documents: IndexedDocument[] = [];
  const indexingTimesMs: number[] = [];
  const semanticConfig = getSemanticConfig();

  await db.insert(users).values({
    email: `benchpipe-${suite}-${benchmarkId}@benchmark.local`,
    email_verified: true,
    encrypted_uek: Buffer.from("bench-user-key"),
    id: userId,
    name: `Pipeline Benchmark User ${suite}`,
    password_hash: "benchmark-password-hash",
    storage_quota: 1024 * 1024 * 1024,
    storage_used: 0,
  });

  const folderRows = selectedThemes.map((theme) => ({
    id: nanoid(),
    name: `Pipeline ${suite} ${theme.name}`,
    parent_id: null,
    user_id: userId,
  }));

  await db.insert(folders).values(folderRows);

  let totalIndexedFiles = 0;

  for (let themeIndex = 0; themeIndex < selectedThemes.length; themeIndex += 1) {
    const theme = selectedThemes[themeIndex]!;
    const folder = folderRows[themeIndex]!;

    for (let fileIndex = 0; fileIndex < config.filesPerTheme; fileIndex += 1) {
      const anchor = theme.anchors[fileIndex % theme.anchors.length]!;
      const stressVariants = suite === "stress"
        ? [anchor.stressTargetText, ...anchor.stressDecoys]
        : [anchor.documentText];

      for (let variantIndex = 0; variantIndex < stressVariants.length; variantIndex += 1) {
        const variantText = stressVariants[variantIndex]!;
        const fileId = nanoid();
        const jobId = nanoid();
        const fileName = `${suite}-document-${themeIndex + 1}-${fileIndex + 1}-${variantIndex + 1}.pdf`;
        const pdfBytes = await createPdfBytes(buildPageTexts(suite, theme, anchor, variantText));

        await db.insert(files).values({
          encrypted_fek: Buffer.from("bench-file-key"),
          folder_id: folder.id,
          has_thumbnail: false,
          id: fileId,
          mime_type: "application/pdf",
          name: fileName,
          size: pdfBytes.byteLength,
          status: "ready",
          total_chunks: 1,
          upload_completed_at: new Date(),
          upload_completed_at_approximate: false,
          user_id: userId,
        });

        await db.insert(embeddingJobs).values({
          attempt_count: 1,
          completed_at: null,
          embedding_dimensions: semanticConfig.embeddingDimensions,
          embedding_model: semanticConfig.geminiEmbeddingModel,
          error_code: null,
          error_message: null,
          file_id: fileId,
          file_size: pdfBytes.byteLength,
          id: jobId,
          mime_type: "application/pdf",
          modality: "pdf",
          ocr_provider: null,
          processor_id: null,
          started_at: new Date(),
          status: "processing",
          triggered_by: userId,
        });

        const indexStart = performance.now();
        const chunks = await splitPdfForEmbedding({
          bytes: pdfBytes,
          fileName,
          mimeType: "application/pdf",
        });

        const chunkValues: Array<{
          chunkIndex: number;
          chunkType: "full" | "page" | "window";
          embedding: string;
          id: string;
          pageFrom: number | null;
          pageTo: number | null;
        }> = [];

        for (const chunk of chunks) {
          const vector = await embedBinaryForRetrieval({
            bytes: chunk.bytes,
            contextText: chunk.contextLabel,
            mimeType: chunk.mimeType,
          });

          chunkValues.push({
            chunkIndex: chunk.chunkIndex,
            chunkType: chunk.chunkType,
            embedding: `[${vector.join(",")}]`,
            id: nanoid(),
            pageFrom: chunk.pageFrom,
            pageTo: chunk.pageTo,
          });
        }

        const insertValues = chunkValues.map((chunk) => sql`
          (
            ${chunk.id},
            ${jobId},
            ${fileId},
            ${chunk.chunkIndex},
            ${chunk.chunkType},
            ${"pdf"},
            ${chunk.pageFrom},
            ${chunk.pageTo},
            null,
            null,
            null,
            null,
            VEC_FromText(${chunk.embedding})
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
          values ${sql.join(insertValues, sql`, `)}
        `);

        await db
          .update(embeddingJobs)
          .set({
            completed_at: new Date(),
            status: "ready",
            updated_at: new Date(),
          })
          .where(eq(embeddingJobs.id, jobId));

        indexingTimesMs.push(performance.now() - indexStart);
        totalIndexedFiles += 1;

        if (variantIndex === 0) {
          documents.push({
            fileId,
            query: getQueryForSuite(suite, anchor),
            suite,
            theme: theme.name,
          });
        }
      }
    }
  }

  return {
    documents,
    fileCount: totalIndexedFiles,
    indexingTimesMs,
    suite,
    userId,
  };
}

export async function cleanupSeededData(userId: string) {
  const db = MariadbConnection.getConnection();
  await db.delete(users).where(eq(users.id, userId));
}

function summarizeDurations(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const percentile = (ratio: number) => {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index] ?? 0;
  };

  return {
    avg: sorted.length > 0 ? total / sorted.length : 0,
    p50: percentile(0.5),
    p95: percentile(0.95),
  };
}

function evaluateAccuracy(
  queryTimesMs: number[],
  ranks: number[],
): AccuracyMetrics {
  const samples = ranks.length;
  const top1 = ranks.filter((rank) => rank === 1).length;
  const top3 = ranks.filter((rank) => rank > 0 && rank <= 3).length;
  const mrr = ranks.reduce((sum, rank) => sum + (rank > 0 ? 1 / rank : 0), 0) / samples;
  const averageSearchTimeMs = queryTimesMs.reduce((sum, value) => sum + value, 0) / samples;

  return {
    averageSearchTimeMs,
    mrr,
    samples,
    top1Accuracy: top1 / samples,
    top3Recall: top3 / samples,
  };
}

export async function measureSemanticAccuracy(seeded: SeededPipelineContext, queryTopK: number) {
  const queryTimesMs: number[] = [];
  const ranks: number[] = [];

  for (const document of seeded.documents) {
    const startedAt = performance.now();
    const queryVector = await embedSemanticQuery(document.query);
    const results = await searchSemanticFiles({
      limit: SEARCH_LIMIT,
      maxScoreGap: MAX_SCORE_GAP,
      minSimilarity: MIN_SIMILARITY,
      queryTopK,
      queryVector,
      userId: seeded.userId,
    });
    queryTimesMs.push(performance.now() - startedAt);

    const rank = results.findIndex((result) => result.fileId === document.fileId);
    ranks.push(rank >= 0 ? rank + 1 : 0);
  }

  return evaluateAccuracy(queryTimesMs, ranks);
}

export async function measureHybridAccuracy(seeded: SeededPipelineContext, queryTopK: number) {
  const queryTimesMs: number[] = [];
  const ranks: number[] = [];

  for (const document of seeded.documents) {
    const startedAt = performance.now();
    const queryVector = await embedSemanticQuery(document.query);
    const results = await searchHybridFiles({
      limit: SEARCH_LIMIT,
      maxScoreGap: MAX_SCORE_GAP,
      minSimilarity: MIN_SIMILARITY,
      query: document.query,
      queryTopK,
      queryVector,
      userId: seeded.userId,
    });
    queryTimesMs.push(performance.now() - startedAt);

    const rank = results.findIndex((result) => result.fileId === document.fileId);
    ranks.push(rank >= 0 ? rank + 1 : 0);
  }

  return evaluateAccuracy(queryTimesMs, ranks);
}

export async function runPipelineSuite(
  config: PipelineBenchmarkConfig,
  suite: BenchmarkSuiteName,
  queryTopK: number,
): Promise<SuiteResult> {
  console.log(`Seeding and indexing ${suite} benchmark PDFs through the live embedding provider...`);
  const seeded = await seedAndIndexDocuments(config, suite);

  try {
    const indexingSummary = summarizeDurations(seeded.indexingTimesMs);

    console.log(`Measuring semantic retrieval accuracy for the ${suite} suite...`);
    const semantic = await measureSemanticAccuracy(seeded, queryTopK);

    console.log(`Measuring hybrid retrieval accuracy for the ${suite} suite...`);
    const hybrid = await measureHybridAccuracy(seeded, queryTopK);

    return {
      hybrid,
      indexingSummary,
      seeded,
      semantic,
    };
  } finally {
    console.log(`Cleaning up seeded ${suite} benchmark data...`);
    await cleanupSeededData(seeded.userId);
  }
}
