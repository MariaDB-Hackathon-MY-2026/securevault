import { join } from "node:path";

import { parsePositiveInteger } from "../shared/runtime";

export type RetrievalBenchmarkConfig = {
  chunkBatchSize: number;
  chunksPerFile: number;
  dimensions: number;
  fileBatchSize: number;
  filesPerTheme: number;
  outputDir: string;
  queriesPerTheme: number;
  queryTopK: number;
  themeCount: number;
  warmupRuns: number;
};

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalBenchmarkConfig = {
  chunkBatchSize: 500,
  chunksPerFile: 3,
  dimensions: 1536,
  fileBatchSize: 250,
  filesPerTheme: 200,
  outputDir: join(process.cwd(), "benchmark"),
  queriesPerTheme: 3,
  queryTopK: 50,
  themeCount: 5,
  warmupRuns: 5,
};

export function printRetrievalHelp() {
  console.log(`Semantic benchmark

Usage:
  npm run benchmark:semantic -- [options]

Options:
  --themes <n>             Number of semantic themes to seed
  --files-per-theme <n>    Files to create per theme
  --chunks-per-file <n>    Embedding chunks per file
  --queries-per-theme <n>  Measured queries to run per theme
  --warmup-runs <n>        Warmup queries before measurement
  --query-top-k <n>        Semantic candidate limit before grouping
  --file-batch-size <n>    Batch size for file/job inserts
  --chunk-batch-size <n>   Batch size for embedding chunk inserts
  --output-dir <path>      Directory for markdown/json result files
`);
}

export function parseRetrievalArgs(argv: string[]) {
  const config = { ...DEFAULT_RETRIEVAL_CONFIG };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    switch (current) {
      case "--themes":
        config.themeCount = parsePositiveInteger(next, config.themeCount);
        index += 1;
        break;
      case "--files-per-theme":
        config.filesPerTheme = parsePositiveInteger(next, config.filesPerTheme);
        index += 1;
        break;
      case "--chunks-per-file":
        config.chunksPerFile = parsePositiveInteger(next, config.chunksPerFile);
        index += 1;
        break;
      case "--queries-per-theme":
        config.queriesPerTheme = parsePositiveInteger(next, config.queriesPerTheme);
        index += 1;
        break;
      case "--warmup-runs":
        config.warmupRuns = parsePositiveInteger(next, config.warmupRuns);
        index += 1;
        break;
      case "--query-top-k":
        config.queryTopK = parsePositiveInteger(next, config.queryTopK);
        index += 1;
        break;
      case "--file-batch-size":
        config.fileBatchSize = parsePositiveInteger(next, config.fileBatchSize);
        index += 1;
        break;
      case "--chunk-batch-size":
        config.chunkBatchSize = parsePositiveInteger(next, config.chunkBatchSize);
        index += 1;
        break;
      case "--output-dir":
        if (!next) {
          throw new Error("--output-dir requires a value.");
        }
        config.outputDir = next;
        index += 1;
        break;
      case "--help":
        printRetrievalHelp();
        process.exit(0);
      default:
        if (current?.startsWith("--")) {
          throw new Error(`Unknown argument: ${current}`);
        }
    }
  }

  return config;
}
