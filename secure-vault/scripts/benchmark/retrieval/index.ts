import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { seedRetrievalBenchmarkData, cleanupRetrievalBenchmarkData, measureRetrievalLatency } from "./benchmark-data";
import { parseRetrievalArgs } from "./cli";
import { buildRetrievalJsonReport, buildRetrievalMarkdownReport } from "./evaluator-report";
import { assertMariadbVectorAvailable, loadLocalEnvFiles } from "../shared/runtime";

async function main() {
  const config = parseRetrievalArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  let seeded = null;

  await loadLocalEnvFiles(process.cwd());

  console.log("Checking MariaDB vector function availability...");
  await assertMariadbVectorAvailable();

  console.log("Seeding benchmark dataset...");
  seeded = await seedRetrievalBenchmarkData(config);

  try {
    console.log(`Seeded ${seeded.fileCount} files and ${seeded.chunkCount} chunks.`);
    console.log("Running measured semantic and hybrid searches...");

    const { hybrid, semantic } = await measureRetrievalLatency(seeded, config);
    const report = buildRetrievalMarkdownReport({
      config,
      hybrid,
      seeded,
      semantic,
      startedAt,
    });
    const jsonReport = buildRetrievalJsonReport({
      config,
      hybrid,
      seeded,
      semantic,
      startedAt,
    });

    await mkdir(config.outputDir, { recursive: true });
    await writeFile(join(config.outputDir, "semantic-search-benchmark-latest.md"), report, "utf8");
    await writeFile(join(config.outputDir, "semantic-search-benchmark-latest.json"), jsonReport, "utf8");

    console.log(report);
    console.log(`Saved reports to ${config.outputDir}`);
  } finally {
    if (seeded) {
      console.log("Cleaning up seeded benchmark data...");
      await cleanupRetrievalBenchmarkData(seeded.userId);
    }
  }
}

main().catch((error) => {
  console.error("Benchmark failed.");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
