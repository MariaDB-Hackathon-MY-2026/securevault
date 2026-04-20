import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getSemanticConfig } from "../../../src/lib/ai/config";

import { runPipelineSuite } from "./benchmark-data";
import { parsePipelineArgs } from "./cli";
import { buildPipelineJsonReport, buildPipelineMarkdownReport } from "./evaluator-report";
import { assertMariadbVectorAvailable, loadLocalEnvFiles } from "../shared/runtime";
import type { SuiteResult } from "./benchmark-data";

async function main() {
  const config = parsePipelineArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();

  await loadLocalEnvFiles(process.cwd());
  await assertMariadbVectorAvailable();

  const semanticConfig = getSemanticConfig();
  if (!semanticConfig.enabled) {
    throw new Error("Semantic indexing must be enabled to run the pipeline accuracy benchmark.");
  }

  if (semanticConfig.provider !== "google") {
    throw new Error("This benchmark is intended for the Google embedding provider. Set SEMANTIC_INDEXING_PROVIDER=google.");
  }

  const results: SuiteResult[] = [];

  for (const suite of config.suites) {
    results.push(await runPipelineSuite(config, suite, semanticConfig.queryTopK));
  }

  const report = buildPipelineMarkdownReport({
    config,
    results,
    startedAt,
  });
  const jsonReport = buildPipelineJsonReport({
    config,
    provider: semanticConfig.provider,
    results,
    startedAt,
  });

  await mkdir(config.outputDir, { recursive: true });
  await writeFile(join(config.outputDir, "semantic-pipeline-accuracy-latest.md"), report, "utf8");
  await writeFile(join(config.outputDir, "semantic-pipeline-accuracy-latest.json"), jsonReport, "utf8");

  console.log(report);
  console.log(`Saved reports to ${config.outputDir}`);
}

main().catch((error) => {
  console.error("Pipeline accuracy benchmark failed.");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
