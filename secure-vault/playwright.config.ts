import { ensureTestEnvLoaded } from "./tests/e2e/helpers/load-test-env";
import { defineConfig, devices } from "@playwright/test";

ensureTestEnvLoaded();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const defaultWorkerCount = 2;

process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.NEXT_PUBLIC_APP_URL ??= baseURL;
process.env.DATABASE_CONNECTION_LIMIT ??= "2";

function resolveWorkerCount() {
  const rawWorkerCount = process.env.PLAYWRIGHT_WORKERS?.trim();

  if (!rawWorkerCount) {
    return defaultWorkerCount;
  }

  const parsedWorkerCount = Number.parseInt(rawWorkerCount, 10);
  return Number.isFinite(parsedWorkerCount) && parsedWorkerCount > 0
    ? parsedWorkerCount
    : defaultWorkerCount;
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  retries: process.env.CI ? 2 : 0,
  workers: resolveWorkerCount(),
  webServer: {
    command: "npx next dev --hostname 127.0.0.1 --port 3100",
    env: {
      ...process.env,
    },
    reuseExistingServer: false,
    timeout: 300_000,
    url: baseURL,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
