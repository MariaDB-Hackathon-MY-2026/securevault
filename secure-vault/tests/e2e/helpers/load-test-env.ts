import { loadEnvConfig } from "@next/env";

let isLoaded = false;

export function ensureTestEnvLoaded() {
  if (isLoaded) {
    return;
  }

  loadEnvConfig(process.cwd());
  isLoaded = true;
}
