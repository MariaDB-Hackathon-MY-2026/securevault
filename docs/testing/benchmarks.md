---
title: Benchmark Workflows
description: How SecureVault's benchmark scripts are organized, when to run each one, and where the generated reports go.
---

# Benchmark Workflows

SecureVault includes two benchmark workflows under <RepoLink path="secure-vault/benchmark" kind="tree" /> and <RepoLink path="secure-vault/scripts/benchmark" kind="tree" />.

Use them for different questions:

- Use the retrieval benchmark when you want to show search responsiveness after documents are already indexed.
- Use the pipeline benchmark when you want to show end-to-end semantic indexing and ranking quality with the live Google embedding path.

## What is in the repository

- Evaluator-facing reports and methodology notes live in <RepoLink path="secure-vault/benchmark" kind="tree" />.
- Executable benchmark scripts live in <RepoLink path="secure-vault/scripts/benchmark" kind="tree" />.
- `retrieval/` contains the latency benchmark entrypoint and report builders.
- `pipeline/` contains the end-to-end accuracy benchmark entrypoint and report builders.
- `shared/runtime.ts` loads `.env.local` or `.env` from `secure-vault/` and checks MariaDB vector support before a run starts.

## Which benchmark to run

| Benchmark | Command | Best for | Includes live embeddings |
| --- | --- | --- | --- |
| Retrieval latency | `npm run benchmark:semantic` | Showing semantic and hybrid search response time after indexing | No |
| Pipeline accuracy | `npm run benchmark:semantic:pipeline` | Showing indexing behavior and retrieval quality end to end | Yes |

## Prerequisites

Run both commands from `secure-vault/`.

Both benchmarks need:

- MariaDB running and reachable through `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, and `DATABASE_NAME`
- MariaDB vector support available for `VEC_FromText(...)` and `vec_distance_cosine(...)`
- a local env file in `secure-vault/.env.local` or `secure-vault/.env` if the values are not already exported in your shell

The pipeline benchmark also needs:

- `SEMANTIC_INDEXING_ENABLED=true`
- `SEMANTIC_INDEXING_PROVIDER=google`
- `GEMINI_API_KEY` set

Recommended local path for the pipeline benchmark:

```env
SEMANTIC_INDEXING_ENABLED=true
SEMANTIC_INDEXING_EXECUTION_MODE=inline
SEMANTIC_INDEXING_PROVIDER=google
GEMINI_API_KEY=<your-key>
```

`inline` is the simpler local mode. If you intentionally switch to `queued`, the semantic config also requires Redis to be configured and available.

## Retrieval benchmark

Use this benchmark for evaluator-facing latency numbers after indexing is already complete.

Command:

```powershell
cd secure-vault
npm run benchmark:semantic
```

What it does:

- checks that MariaDB vector functions are available
- seeds a synthetic benchmark user, files, embedding jobs, and embedding chunks
- runs semantic-only and hybrid retrieval through the real application search path
- writes markdown and JSON reports
- deletes the seeded benchmark data in a cleanup step

Useful flags:

```powershell
npm run benchmark:semantic -- --themes 6 --files-per-theme 500 --chunks-per-file 3 --queries-per-theme 5
```

Available options:

- `--themes`
- `--files-per-theme`
- `--chunks-per-file`
- `--queries-per-theme`
- `--warmup-runs`
- `--query-top-k`
- `--file-batch-size`
- `--chunk-batch-size`
- `--output-dir`

Default output files:

- <RepoLink path="secure-vault/benchmark/semantic-search-benchmark-latest.md" />
- <RepoLink path="secure-vault/benchmark/semantic-search-benchmark-latest.json" />

Read the generated report as a responsiveness benchmark, not an accuracy benchmark. It excludes live embedding latency by design.

## Pipeline benchmark

Use this benchmark when you need evidence that SecureVault can index benchmark documents end to end and still retrieve the correct file.

Command:

```powershell
cd secure-vault
npm run benchmark:semantic:pipeline
```

What it does:

- checks MariaDB vector support
- validates that semantic indexing is enabled with the Google provider
- generates temporary benchmark PDFs
- chunks and embeds them through the real semantic pipeline
- stores vectors in MariaDB
- runs semantic-only and hybrid retrieval for benchmark queries
- writes markdown and JSON reports

Useful flags:

```powershell
npm run benchmark:semantic:pipeline -- --suite stress --themes 4 --files-per-theme 3
```

Available options:

- `--themes`
- `--files-per-theme`
- `--suite controlled|stress|both`
- `--output-dir`

Default output files:

- <RepoLink path="secure-vault/benchmark/semantic-pipeline-accuracy-latest.md" />
- <RepoLink path="secure-vault/benchmark/semantic-pipeline-accuracy-latest.json" />

The benchmark runs two suites by default:

- `controlled` for clean, direct phrasing and easier topical separation
- `stress` for paraphrased queries and confusable same-theme documents

Use the pipeline report for ranking quality discussions. Pair it with the retrieval benchmark if you also want to show search speed.

## Reading the reports

Use the retrieval report to answer "How fast is search after indexing?"

- focus on average latency and `P95`
- compare semantic-only and hybrid retrieval at the same dataset size

Use the pipeline report to answer "How well does the system retrieve the right file?"

- focus on `Top-1 Accuracy`, `Top-3 Recall`, and `MRR` together
- treat `controlled` as the cleaner correctness benchmark
- treat `stress` as the more realistic retrieval benchmark

## Related files

- Benchmark package overview: <RepoLink path="secure-vault/benchmark/README.md" />
- Retrieval methodology: <RepoLink path="secure-vault/benchmark/semantic-search-benchmark-guide.md" />
- Pipeline methodology: <RepoLink path="secure-vault/benchmark/semantic-pipeline-accuracy-guide.md" />
- Retrieval CLI: <RepoLink path="secure-vault/scripts/benchmark/retrieval/cli.ts" />
- Pipeline CLI: <RepoLink path="secure-vault/scripts/benchmark/pipeline/cli.ts" />
