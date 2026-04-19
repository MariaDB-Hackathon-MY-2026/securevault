import { join } from "node:path";

import { parsePositiveInteger } from "../shared/runtime";

export type BenchmarkSuiteName = "controlled" | "stress";

export type PipelineBenchmarkConfig = {
  filesPerTheme: number;
  outputDir: string;
  suites: BenchmarkSuiteName[];
  themeCount: number;
};

export const DEFAULT_PIPELINE_CONFIG: PipelineBenchmarkConfig = {
  filesPerTheme: 3,
  outputDir: join(process.cwd(), "..", "..", "benchmark"),
  suites: ["controlled", "stress"],
  themeCount: 4,
};

function parseSuiteSelection(value: string | undefined): BenchmarkSuiteName[] {
  if (!value || value === "both") {
    return ["controlled", "stress"];
  }

  if (value === "controlled" || value === "stress") {
    return [value];
  }

  throw new Error(`Unknown suite "${value}". Expected controlled, stress, or both.`);
}

export function printPipelineHelp() {
  console.log(`Semantic pipeline accuracy benchmark

Usage:
  npm run benchmark:semantic:pipeline -- [options]

Options:
  --themes <n>             Number of benchmark themes to index
  --files-per-theme <n>    Documents per theme
  --suite <name>           controlled, stress, or both
  --output-dir <path>      Directory for markdown/json result files
`);
}

export function parsePipelineArgs(argv: string[]) {
  const config = { ...DEFAULT_PIPELINE_CONFIG };

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
      case "--output-dir":
        if (!next) {
          throw new Error("--output-dir requires a value.");
        }
        config.outputDir = next;
        index += 1;
        break;
      case "--suite":
        config.suites = parseSuiteSelection(next);
        index += 1;
        break;
      case "--help":
        printPipelineHelp();
        process.exit(0);
      default:
        if (current?.startsWith("--")) {
          throw new Error(`Unknown argument: ${current}`);
        }
    }
  }

  return config;
}
