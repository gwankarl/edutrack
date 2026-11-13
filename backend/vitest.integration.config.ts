import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/modules/health/health.integration.test.ts",
      "tests/integration/**/*.integration.test.ts",
    ],
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
