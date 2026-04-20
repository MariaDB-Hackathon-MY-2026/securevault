# Benchmark Script Layout

Benchmark code is organized by benchmark type:

- `retrieval/`
  Retrieval latency benchmark after indexing is already complete.
- `pipeline/`
  End-to-end semantic pipeline benchmark using the live embedding provider.
- `shared/`
  Runtime helpers shared by benchmark entrypoints.

Each benchmark is split into:

- `cli.ts`
  Command-line parsing and default configuration.
- `benchmark-data.ts`
  Dataset seeding, measurement logic, and benchmark execution helpers.
- `evaluator-report.ts`
  Evaluator-facing markdown and JSON report generation.
- `index.ts`
  Thin entrypoint that wires the benchmark together.
