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
      "server-only": resolve(__dirname, "tests/support/server-only.ts"),
    },
  },
});
