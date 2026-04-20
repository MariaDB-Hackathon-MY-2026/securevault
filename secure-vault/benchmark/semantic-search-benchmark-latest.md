# SecureVault Retrieval Benchmark Report

Generated at: 2026-04-20T14:02:37.293Z

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

- Themes: 5
- Queries per theme: 3
- Warmup runs: 5
- Search limit: 10
- Query top K: 50

## Dataset

- Files per theme: 200
- Total files: 1000
- Chunks per file: 3
- Total embedding chunks: 3000
- Query cases: 15

## Results

| Benchmark | Samples | Avg | P50 | P95 | P99 | Max | Avg results |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Semantic retrieval only | 15 | 1015.31 ms | 1005.73 ms | 1104.04 ms | 1104.04 ms | 1104.04 ms | 10.00 |
| Hybrid retrieval | 15 | 1013.42 ms | 1016.98 ms | 1063.83 ms | 1063.83 ms | 1063.83 ms | 10.00 |

## How To Read These Results

- `Semantic retrieval only` isolates vector-based retrieval performance after indexing is already complete.
- `Hybrid retrieval` shows the latency cost of combining semantic retrieval with filename-aware ranking.
- `P95` is the most useful summary number for evaluator-facing discussion because it shows typical worst-case latency without focusing only on the single slowest run.

## Interpretation

- This benchmark is best used to explain SecureVault's retrieval responsiveness, not end-to-end indexing quality.
- If the evaluator asks about accuracy, use the separate pipeline benchmark report because that benchmark measures document ranking quality with real Google embeddings.
- The main comparison to emphasize is semantic-only versus hybrid retrieval at the same dataset size.

## Notes

- These measurements intentionally exclude external embedding-provider latency so the numbers reflect retrieval inside the product.
- The seeded benchmark uses synthetic vectors and filenames to exercise the same MariaDB vector and hybrid ranking paths used by the application.
