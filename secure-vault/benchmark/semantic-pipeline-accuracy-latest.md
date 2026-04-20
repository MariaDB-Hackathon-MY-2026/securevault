# SecureVault Semantic Pipeline Benchmark Report

Generated at: 2026-04-20T14:02:34.666Z

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

- Themes: 4
- Files per theme: 3
- Suites: Controlled, Stress
- Provider: Google embeddings

## Summary

| Suite | Benchmark | Top-1 Accuracy | Top-3 Recall | MRR | Avg query time | Avg indexing time |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Controlled | Semantic | 100.0% | 100.0% | 1.000 | 456.50 ms | 5691.43 ms |
| Controlled | Hybrid | 100.0% | 100.0% | 1.000 | 781.83 ms | 5691.43 ms |
| Stress | Semantic | 50.0% | 100.0% | 0.750 | 749.99 ms | 6800.25 ms |
| Stress | Hybrid | 50.0% | 100.0% | 0.750 | 562.53 ms | 6800.25 ms |

## Controlled Suite

Curated benchmark with direct topic phrasing and clean topical separation.

### What This Suite Tests

- End-to-end correctness when query wording is close to the indexed document meaning.
- Whether the full pipeline can reliably return the intended document in a cleaner evaluation setting.

### Dataset

- Indexed PDF documents: 12
- Queries evaluated: 12

### Indexing Timing

| Metric | Value |
| --- | ---: |
| Average indexing time per document | 5691.43 ms |
| P50 indexing time per document | 5576.57 ms |
| P95 indexing time per document | 7025.60 ms |

### Retrieval Accuracy

| Benchmark | Samples | Top-1 Accuracy | Top-3 Recall | MRR | Avg query time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Semantic search | 12 | 100.0% | 100.0% | 1.000 | 456.50 ms |
| Hybrid search | 12 | 100.0% | 100.0% | 1.000 | 781.83 ms |

## Stress Suite

Harder benchmark with paraphrased queries and deliberately overlapping policy vocabulary across documents.

### What This Suite Tests

- Retrieval robustness when several documents share similar vocabulary and only differ by a critical detail.
- Whether the correct document still appears near the top under more realistic and confusable conditions.

### Dataset

- Indexed PDF documents: 36
- Queries evaluated: 12

### Indexing Timing

| Metric | Value |
| --- | ---: |
| Average indexing time per document | 6800.25 ms |
| P50 indexing time per document | 6775.96 ms |
| P95 indexing time per document | 7426.87 ms |

### Retrieval Accuracy

| Benchmark | Samples | Top-1 Accuracy | Top-3 Recall | MRR | Avg query time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Semantic search | 12 | 50.0% | 100.0% | 0.750 | 749.99 ms |
| Hybrid search | 12 | 50.0% | 100.0% | 0.750 | 562.53 ms |


## How To Read These Results

- `Top-1 Accuracy` shows how often the correct file was ranked first.
- `Top-3 Recall` shows how often the correct file still appeared within the first three results.
- `MRR` summarizes ranking quality across all queries, giving partial credit when the correct file is near the top but not ranked first.
- The controlled suite is your correctness benchmark, while the stress suite is the stronger realism benchmark for presentation.

## Interpretation

- Use this report when discussing retrieval quality, not just speed.
- If stress-suite Top-1 drops while Top-3 remains strong, that means the system is retrieving the right document family but ranking among very similar documents is still challenging.
- Pair this report with the separate retrieval benchmark if you want to show both responsiveness and accuracy.

## Notes

- The benchmark isolates semantic indexing and search quality; it does not include upload transport time or Cloudflare R2 reads.
- Filenames are intentionally generic so the benchmark favors document meaning instead of exact filename matches.
- Treat the controlled suite as a correctness benchmark and the stress suite as the more realistic retrieval benchmark.
