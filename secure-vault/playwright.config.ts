import { ensureTestEnvLoaded } from "./tests/e2e/helpers/load-test-env";
import { defineConfig, devices } from "@playwright/test";

ensureTestEnvLoaded();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const useManagedServer = process.env.PLAYWRIGHT_USE_MANAGED_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: useManagedServer
    ? {
        command: "npm run build && npm run start:host",
        port: 3000,
        reuseExistingServer: false,
        timeout: 240_000,
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
