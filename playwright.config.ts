/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

const host = process.env.E2E_HOST ?? "127.0.0.1";
const frontendPort = process.env.E2E_FRONTEND_PORT ?? "5173";
const backendPort = process.env.E2E_BACKEND_PORT ?? "5000";

const frontendUrl = `http://${host}:${frontendPort}`;
const backendUrl = `http://${host}:${backendPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: frontendUrl,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev --workspace=backend",
      url: `${backendUrl}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: "test",
        HOST: host,
        PORT: backendPort,
        // Synthetic placeholder. The E2E suite does not access PostgreSQL.
        DATABASE_URL: "postgresql://unused:unused@localhost/edutrack_e2e",
      },
    },
    {
      command:
        `npm run dev --workspace=frontend -- --host ${host} ` +
        `--port ${frontendPort} --strictPort`,
      url: frontendUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        API_PROXY_TARGET: backendUrl,
      },
    },
  ],
});
