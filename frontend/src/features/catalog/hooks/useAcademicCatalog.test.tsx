import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAcademicCatalog } from "./useAcademicCatalog.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return Wrapper;
}

describe("useAcademicCatalog", () => {
  it("loads levels and subjects from their public endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "550e8400-e29b-41d4-a716-446655440001",
                code: "form-4",
                name: "Form 4",
                educationStage: "lower_secondary",
                sortOrder: 4,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "550e8400-e29b-41d4-a716-446655440010",
                code: "mathematics",
                name: "Mathematics",
                sortOrder: 1,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAcademicCatalog(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      academicLevels: [
        expect.objectContaining({ code: "form-4", name: "Form 4" }),
      ],
      subjects: [
        expect.objectContaining({
          code: "mathematics",
          name: "Mathematics",
        }),
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/academic-levels",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/subjects",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("exposes API failures through query error state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Catalog unavailable",
          status: 503,
          detail: "Try again later.",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAcademicCatalog(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({
      name: "ApiError",
      status: 503,
    });
  });
});
