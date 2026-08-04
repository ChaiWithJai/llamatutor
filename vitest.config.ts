import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "utils/**/*.test.ts",
      "evaluation/**/*.test.ts",
      "app/api/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["utils/coaching.ts"],
    },
  },
});
