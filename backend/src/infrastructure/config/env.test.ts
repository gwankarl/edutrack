import { describe, expect, it } from "vitest";

import { loadEnvironment } from "./env.js";

describe("loadEnvironment", () => {
  it("parses a valid PostgreSQL URL and applies defaults", () => {
    expect(
      loadEnvironment({
        DATABASE_URL:
          "postgresql://edutrack:replace-me@localhost:5432/edutrack",
      }),
    ).toEqual({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: 5000,
      DATABASE_URL: "postgresql://edutrack:replace-me@localhost:5432/edutrack",
      FRONTEND_URL: "http://localhost:5173",
      SESSION_TTL_SECONDS: 604800,
    });
  });

  it("rejects a database URL with a non-PostgreSQL scheme", () => {
    expect(() =>
      loadEnvironment({ DATABASE_URL: "https://example.com" }),
    ).toThrow();
  });

  it("rejects a session lifetime outside the configured range", () => {
    expect(() =>
      loadEnvironment({
        DATABASE_URL:
          "postgresql://edutrack:replace-me@localhost:5432/edutrack",
        SESSION_TTL_SECONDS: "0",
      }),
    ).toThrow();
  });

  it("accepts Cloudinary settings only when the complete credential set is present", () => {
    expect(() =>
      loadEnvironment({
        DATABASE_URL:
          "postgresql://edutrack:replace-me@localhost:5432/edutrack",
        CLOUDINARY_CLOUD_NAME: "demo-cloud",
        CLOUDINARY_API_KEY: "demo-key",
        CLOUDINARY_API_SECRET: "demo-secret",
      }),
    ).not.toThrow();

    expect(() =>
      loadEnvironment({
        DATABASE_URL:
          "postgresql://edutrack:replace-me@localhost:5432/edutrack",
        CLOUDINARY_CLOUD_NAME: "demo-cloud",
      }),
    ).toThrow();
  });
});
