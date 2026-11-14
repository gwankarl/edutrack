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
    });
  });

  it("rejects a database URL with a non-PostgreSQL scheme", () => {
    expect(() =>
      loadEnvironment({ DATABASE_URL: "https://example.com" }),
    ).toThrow();
  });
});
