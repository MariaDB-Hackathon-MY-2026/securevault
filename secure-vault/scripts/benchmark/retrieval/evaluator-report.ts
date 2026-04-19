import type { RetrievalBenchmarkConfig } from "./cli";
import type { RetrievalBenchmarkMeasurement, RetrievalSeedContext } from "./benchmark-data";

function formatMeasurementRow(label: string, measurement: RetrievalBenchmarkMeasurement) {
  return `| ${label} | ${measurement.samples} | ${measurement.avgMs.toFixed(2)} ms | ${measurement.p50Ms.toFixed(2)} ms | ${measurement.p95Ms.toFixed(2)} ms | ${measurement.p99Ms.toFixed(2)} ms | ${measurement.maxMs.toFixed(2)} ms | ${measurement.resultCountAvg.toFixed(2)} |`;
}

export function buildRetrievalMarkdownReport(input: {
  config: RetrievalBenchmarkConfig;
  hybrid: RetrievalBenchmarkMeasurement;
  seeded: RetrievalSeedContext;
  semantic: RetrievalBenchmarkMeasurement;
  startedAt: string;
}) {
  return `# SecureVault Retrieval Benchmark Report

Generated at: ${input.startedAt}

## Benchmark Objective

This report evaluates retrieval latency inside SecureVault after documents have already been indexed. It is intended for evaluators who want to understand how quickly the product can return semantic and hybrid search results using the real MariaDB vector-backed retrieval path.

## What This Benchmark Tests

- Semantic retrieval latency using the production application search function.
- Hybrid retrieval latency using semantic ranking plus filename-aware ranking.
- Retrieval performance at the seeded dataset size shown below.

## What This Benchmark Does Not Test

- Google embedding generation time.
- Upload transport time or Cloudflare R2 reads.
- OCR, auto-tagging, or document classification pipelines.
- Real user traffic or internet-scale production load.

## Run Configuration

- Themes: ${input.config.themeCount}
- Queries per theme: ${input.config.queriesPerTheme}
- Warmup runs: ${input.config.warmupRuns}
- Search limit: 10
- Query top K: ${input.config.queryTopK}

## Dataset

- Files per theme: ${input.config.filesPerTheme}
- Total files: ${input.seeded.fileCount}
- Chunks per file: ${input.config.chunksPerFile}
- Total embedding chunks: ${input.seeded.chunkCount}
- Query cases: ${input.seeded.queryCases.length}

## Results

| Benchmark | Samples | Avg | P50 | P95 | P99 | Max | Avg results |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${formatMeasurementRow("Semantic retrieval only", input.semantic)}
${formatMeasurementRow("Hybrid retrieval", input.hybrid)}

## How To Read These Results

- \`Semantic retrieval only\` isolates vector-based retrieval performance after indexing is already complete.
- \`Hybrid retrieval\` shows the latency cost of combining semantic retrieval with filename-aware ranking.
- \`P95\` is the most useful summary number for evaluator-facing discussion because it shows typical worst-case latency without focusing only on the single slowest run.

## Interpretation

- This benchmark is best used to explain SecureVault's retrieval responsiveness, not end-to-end indexing quality.
- If the evaluator asks about accuracy, use the separate pipeline benchmark report because that benchmark measures document ranking quality with real Google embeddings.
- The main comparison to emphasize is semantic-only versus hybrid retrieval at the same dataset size.

## Notes

- These measurements intentionally exclude external embedding-provider latency so the numbers reflect retrieval inside the product.
- The seeded benchmark uses synthetic vectors and filenames to exercise the same MariaDB vector and hybrid ranking paths used by the application.
`;
}

export function buildRetrievalJsonReport(input: {
  config: RetrievalBenchmarkConfig;
  hybrid: RetrievalBenchmarkMeasurement;
  seeded: RetrievalSeedContext;
  semantic: RetrievalBenchmarkMeasurement;
  startedAt: string;
}) {
  return JSON.stringify({
    config: input.config,
    dataset: {
      chunkCount: input.seeded.chunkCount,
      fileCount: input.seeded.fileCount,
      folderCount: input.seeded.folderCount,
      queryCaseCount: input.seeded.queryCases.length,
    },
    hybrid: input.hybrid,
    semantic: input.semantic,
    startedAt: input.startedAt,
  }, null, 2);
}
