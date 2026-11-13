import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pg", () => ({
  Pool: vi.fn(),
}));

import { Pool } from "pg";

import { createDatabasePool } from "./pool.js";

describe("createDatabasePool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a bounded pool using the configured database URL", () => {
    createDatabasePool({
      DATABASE_URL: "postgresql://edutrack:replace-me@localhost:5432/edutrack",
    });

    expect(Pool).toHaveBeenCalledWith({
      connectionString:
        "postgresql://edutrack:replace-me@localhost:5432/edutrack",
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  });
});
