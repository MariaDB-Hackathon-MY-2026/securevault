import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "redis": resolve(__dirname, "tests/support/redis.ts"),
      "resend": resolve(__dirname, "tests/support/resend.ts"),
      "server-only": resolve(__dirname, "tests/support/server-only.ts"),
    },
  },
});
