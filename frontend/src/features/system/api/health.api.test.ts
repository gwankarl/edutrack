import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../../../lib/api/api-client.js";
import { getBackendHealth } from "./health.api.js";

vi.mock("../../../lib/api/api-client.js", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

afterEach(() => {
  vi.clearAllMocks();
});

describe("getBackendHealth", () => {
  it("requests the health endpoint and returns its shared contract", async () => {
    const controller = new AbortController();
    mockedApiRequest.mockResolvedValueOnce({ status: "ok" });

    await expect(getBackendHealth(controller.signal)).resolves.toEqual({
      status: "ok",
    });

    expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/health", {
      method: "GET",
      signal: controller.signal,
    });
  });

  it("rejects an empty response", async () => {
    mockedApiRequest.mockResolvedValueOnce(undefined);

    await expect(getBackendHealth()).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });
  });

  it("rejects a response that does not match the shared contract", async () => {
    mockedApiRequest.mockResolvedValueOnce({ status: "degraded" });

    await expect(getBackendHealth()).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });
  });
});
