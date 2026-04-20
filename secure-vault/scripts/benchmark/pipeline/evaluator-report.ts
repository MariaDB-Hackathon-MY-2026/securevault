import type { BenchmarkSuiteName, PipelineBenchmarkConfig } from "./cli";
import { formatPercent, formatSuiteName, getSuiteDescription } from "./benchmark-data";
import type { SuiteResult } from "./benchmark-data";

function buildSuiteSection(result: SuiteResult) {
  return `## ${formatSuiteName(result.seeded.suite)} Suite

${getSuiteDescription(result.seeded.suite)}

### What This Suite Tests

${result.seeded.suite === "controlled"
    ? "- End-to-end correctness when query wording is close to the indexed document meaning.\n- Whether the full pipeline can reliably return the intended document in a cleaner evaluation setting."
    : "- Retrieval robustness when several documents share similar vocabulary and only differ by a critical detail.\n- Whether the correct document still appears near the top under more realistic and confusable conditions."}

### Dataset

- Indexed PDF documents: ${result.seeded.fileCount}
- Queries evaluated: ${result.seeded.documents.length}

### Indexing Timing

| Metric | Value |
| --- | ---: |
| Average indexing time per document | ${result.indexingSummary.avg.toFixed(2)} ms |
| P50 indexing time per document | ${result.indexingSummary.p50.toFixed(2)} ms |
| P95 indexing time per document | ${result.indexingSummary.p95.toFixed(2)} ms |

### Retrieval Accuracy

| Benchmark | Samples | Top-1 Accuracy | Top-3 Recall | MRR | Avg query time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Semantic search | ${result.semantic.samples} | ${formatPercent(result.semantic.top1Accuracy)} | ${formatPercent(result.semantic.top3Recall)} | ${result.semantic.mrr.toFixed(3)} | ${result.semantic.averageSearchTimeMs.toFixed(2)} ms |
| Hybrid search | ${result.hybrid.samples} | ${formatPercent(result.hybrid.top1Accuracy)} | ${formatPercent(result.hybrid.top3Recall)} | ${result.hybrid.mrr.toFixed(3)} | ${result.hybrid.averageSearchTimeMs.toFixed(2)} ms |
`;
}

function buildSummaryTable(results: SuiteResult[]) {
  const rows = results.flatMap((result) => [
    `| ${formatSuiteName(result.seeded.suite)} | Semantic | ${formatPercent(result.semantic.top1Accuracy)} | ${formatPercent(result.semantic.top3Recall)} | ${result.semantic.mrr.toFixed(3)} | ${result.semantic.averageSearchTimeMs.toFixed(2)} ms | ${result.indexingSummary.avg.toFixed(2)} ms |`,
    `| ${formatSuiteName(result.seeded.suite)} | Hybrid | ${formatPercent(result.hybrid.top1Accuracy)} | ${formatPercent(result.hybrid.top3Recall)} | ${result.hybrid.mrr.toFixed(3)} | ${result.hybrid.averageSearchTimeMs.toFixed(2)} ms | ${result.indexingSummary.avg.toFixed(2)} ms |`,
  ]);

  return `| Suite | Benchmark | Top-1 Accuracy | Top-3 Recall | MRR | Avg query time | Avg indexing time |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
${rows.join("\n")}`;
}

export function buildPipelineMarkdownReport(input: {
  config: PipelineBenchmarkConfig;
  results: SuiteResult[];
  startedAt: string;
}) {
  return `# SecureVault Semantic Pipeline Benchmark Report

Generated at: ${input.startedAt}

## Benchmark Objective

This report evaluates SecureVault's semantic retrieval quality using the live Google embedding pipeline. It is intended for evaluators who want to see whether the system can index documents end to end and retrieve the correct file under both clean and more realistic stress conditions.

## What This Benchmark Tests

- PDF generation for benchmark documents.
- Real application chunking through the PDF embedding splitter.
- Google embedding calls for document indexing and query embedding.
- MariaDB vector persistence and retrieval through the production search functions.
- Exact-file ranking quality for both semantic-only and hybrid retrieval.

## What This Benchmark Does Not Test

- End-user upload transport time.
- Cloudflare R2 upload latency.
- OCR or auto-tagging.
- Live production traffic from real users.

## Run Configuration

- Themes: ${input.config.themeCount}
- Files per theme: ${input.config.filesPerTheme}
- Suites: ${input.config.suites.map(formatSuiteName).join(", ")}
- Provider: Google embeddings

## Summary

${buildSummaryTable(input.results)}

${input.results.map(buildSuiteSection).join("\n")}

## How To Read These Results

- \`Top-1 Accuracy\` shows how often the correct file was ranked first.
- \`Top-3 Recall\` shows how often the correct file still appeared within the first three results.
- \`MRR\` summarizes ranking quality across all queries, giving partial credit when the correct file is near the top but not ranked first.
- The controlled suite is your correctness benchmark, while the stress suite is the stronger realism benchmark for presentation.

## Interpretation

- Use this report when discussing retrieval quality, not just speed.
- If stress-suite Top-1 drops while Top-3 remains strong, that means the system is retrieving the right document family but ranking among very similar documents is still challenging.
- Pair this report with the separate retrieval benchmark if you want to show both responsiveness and accuracy.

## Notes

- The benchmark isolates semantic indexing and search quality; it does not include upload transport time or Cloudflare R2 reads.
- Filenames are intentionally generic so the benchmark favors document meaning instead of exact filename matches.
- Treat the controlled suite as a correctness benchmark and the stress suite as the more realistic retrieval benchmark.
`;
}

export function buildPipelineJsonReport(input: {
  config: PipelineBenchmarkConfig;
  provider: string;
  results: SuiteResult[];
  startedAt: string;
}) {
  return JSON.stringify({
    config: input.config,
    provider: input.provider,
    results: input.results.map((result) => ({
      hybrid: result.hybrid,
      indexingSummary: result.indexingSummary,
      samples: result.seeded.documents.length,
      semantic: result.semantic,
      suite: result.seeded.suite,
    })),
    startedAt: input.startedAt,
  }, null, 2);
}
