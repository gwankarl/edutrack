import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app/create-app.js";

const app = await createApp({
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://edutrack:replace-me@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/v1/health", () => {
  it("returns an OK status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
