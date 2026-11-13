import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useQuery } from "@tanstack/react-query";

import BackendStatus from "./BackendStatus.js";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

const mockedUseQuery = vi.mocked(useQuery);

afterEach(() => {
  vi.clearAllMocks();
});

function renderStatus(queryResult: unknown): string {
  mockedUseQuery.mockReturnValue(queryResult as never);

  return renderToStaticMarkup(createElement(BackendStatus));
}

describe("BackendStatus", () => {
  it("announces while the health check is loading", () => {
    const markup = renderStatus({
      data: undefined,
      isError: false,
      isPending: true,
    });

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Checking backend availability");
  });

  it("announces when the backend is available", () => {
    const markup = renderStatus({
      data: { status: "ok" },
      isError: false,
      isPending: false,
    });

    expect(markup).toContain("The backend is available.");
  });

  it("shows a safe message when the health check fails", () => {
    const markup = renderStatus({
      data: undefined,
      isError: true,
      isPending: false,
    });

    expect(markup).toContain("The backend is unavailable.");
    expect(markup).not.toContain("password");
  });
});
