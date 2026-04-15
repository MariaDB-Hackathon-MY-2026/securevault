import { runEmbeddingWorker } from "../src/lib/ai/embeddings/worker";

const abortController = new AbortController();

for (const signalName of ["SIGINT", "SIGTERM"] as const) {
  process.on(signalName, () => {
    abortController.abort(new Error(`Received ${signalName}`));
  });
}

void runEmbeddingWorker(abortController.signal).catch((error) => {
  console.error("Embedding worker exited with an error", error);
  process.exitCode = 1;
});
