# SecureVault Semantic Pipeline Benchmark Guide

## Purpose

This benchmark is meant for evaluator-facing evidence of retrieval quality. It measures the full semantic pipeline using the live Google embedding provider.

The benchmark is intended to document:

- how accurately SecureVault retrieves the correct document
- how the system behaves under both clean and harsh evaluation conditions
- how long indexing takes when the live embedding provider is enabled

## What This Benchmark Tests

- PDF generation for benchmark documents
- application chunking through the real PDF chunk planner
- Google embedding calls for document chunks
- MariaDB vector persistence
- query embedding through the real query embedding path
- semantic-only retrieval quality
- hybrid retrieval quality

## Benchmark Suites

- `controlled`
  Tests end-to-end correctness on a cleaner dataset with direct phrasing and clearer topical separation.
- `stress`
  Tests harder retrieval conditions using paraphrased queries, overlapping policy vocabulary, and same-theme decoy documents that differ by one critical detail.

This benchmark addresses retrieval quality rather than retrieval latency alone.

## Command

Run from `secure-vault/`:

```powershell
npm run benchmark:semantic:pipeline
```

Optional example:

```powershell
npm run benchmark:semantic:pipeline -- --suite stress --themes 4 --files-per-theme 3
```

## Preconditions

- MariaDB must be running and reachable with vector support enabled.
- `SEMANTIC_INDEXING_ENABLED=true`
- `SEMANTIC_INDEXING_PROVIDER=google`
- `GEMINI_API_KEY` must be set

## What The Script Actually Does

- creates temporary benchmark users
- generates benchmark PDFs
- chunks the PDFs through the application's real chunking path
- embeds each chunk through the Google provider path
- stores the vectors in MariaDB
- embeds benchmark queries through the real query embedding path
- runs semantic-only and hybrid retrieval through the real search functions
- computes exact-file retrieval metrics
- deletes the seeded benchmark data after the run

## Output Files

- `benchmark/semantic-pipeline-accuracy-latest.md`
- `benchmark/semantic-pipeline-accuracy-latest.json`

The markdown file is the evaluator-facing report.

## Reported Metrics

- average indexing time per document
- p95 indexing time per document
- semantic search Top-1 accuracy
- semantic search Top-3 recall
- semantic search MRR
- hybrid search Top-1 accuracy
- hybrid search Top-3 recall
- hybrid search MRR

## Interpretation

- The controlled suite measures end-to-end correctness on a cleaner benchmark set.
- The stress suite measures retrieval behavior under harder conditions with paraphrases, overlapping vocabulary, and confusable decoy documents.
- Exact-file Top-1, Top-3, and MRR should be read together rather than in isolation, because Top-3 can remain strong even when ranking among very similar documents is still difficult.

## Caveats

This benchmark measures semantic indexing and retrieval quality, not the full file upload transport path. It includes chunking, Google embeddings, MariaDB vector persistence, query embedding, and retrieval. It does not include Cloudflare R2 upload time or end-user network upload time.
