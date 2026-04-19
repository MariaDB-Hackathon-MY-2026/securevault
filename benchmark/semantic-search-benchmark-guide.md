# SecureVault Retrieval Benchmark Guide

## Purpose

This benchmark is meant for evaluator-facing evidence of retrieval latency. It measures search responsiveness inside SecureVault after indexing has already completed.

The benchmark is intended to document:

- semantic retrieval latency
- hybrid retrieval latency
- retrieval performance at the seeded dataset size

## What This Benchmark Tests

- semantic retrieval latency through the real application search function
- hybrid retrieval latency through the real application search function
- retrieval performance against seeded data in the application database

## What This Benchmark Does Not Test

- Google embedding latency
- upload time
- OCR or auto-tagging
- end-to-end indexing quality

## Command

Run from `secure-vault/`:

```powershell
npm run benchmark:semantic
```

Optional larger dataset example:

```powershell
npm run benchmark:semantic -- --themes 6 --files-per-theme 500 --chunks-per-file 3 --queries-per-theme 5
```

## Preconditions

- MariaDB must be running and reachable through the application's configured database environment.
- The database must support `vector(...)`, `VEC_FromText(...)`, and `vec_distance_cosine(...)`.
- The benchmark script seeds its own synthetic user, folders, files, embedding jobs, and embedding chunks, then deletes them after the run.

## Output Files

- `benchmark/semantic-search-benchmark-latest.md`
- `benchmark/semantic-search-benchmark-latest.json`

## Reported Metrics

- semantic retrieval average latency
- semantic retrieval p95 latency
- hybrid retrieval average latency
- hybrid retrieval p95 latency
- dataset size in files and embedding chunks

## Interpretation

- The benchmark should be read as a measurement of retrieval responsiveness inside the product, not retrieval accuracy.
- The most informative latency comparison is semantic-only versus hybrid retrieval at the same dataset size.
- P95 is typically more representative than a single maximum value because it reflects sustained worst-case behavior without over-weighting an outlier run.

## Caveats

- These measurements exclude external embedding-provider latency.
- The benchmark uses seeded synthetic vectors and filenames to exercise the same MariaDB vector and hybrid ranking paths used by the application.
- Accuracy claims should be based on the separate semantic pipeline benchmark rather than this latency benchmark.
