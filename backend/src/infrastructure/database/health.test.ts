import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { checkDatabaseHealth } from "./health.js";

describe("checkDatabaseHealth", () => {
  it("returns ok when SELECT 1 succeeds", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    } as unknown as Pool;

    await expect(checkDatabaseHealth(pool)).resolves.toEqual({
      status: "ok",
    });
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns unavailable without exposing the driver error", async () => {
    const pool = {
      query: vi
        .fn()
        .mockRejectedValue(
          new Error("connection failed: password=private-value"),
        ),
    } as unknown as Pool;

    await expect(checkDatabaseHealth(pool)).resolves.toEqual({
      status: "unavailable",
    });
  });
});
