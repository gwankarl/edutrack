import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import {
  createTeacherQuizOption,
  reorderTeacherQuizOptions,
  updateTeacherQuizOption,
} from "./quiz-options.api.js";

afterEach(() => vi.unstubAllGlobals());

const questionId = "550e8400-e29b-41d4-a716-446655440023";
const optionId = "550e8400-e29b-41d4-a716-446655440024";
const option = {
  id: optionId,
  questionId,
  optionText: "x = 4",
  position: 1,
  isCorrect: true,
};

function stubResponses(
  ...responses: Array<{ body: unknown; status?: number }>
) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(response.body), {
        status: response.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("quiz option API client", () => {
  it("creates, updates, and reorders answer options on supported routes", async () => {
    const fetchMock = stubResponses(
      { body: option, status: 201 },
      { body: { ...option, isCorrect: false } },
      { body: [option] },
    );

    await expect(
      createTeacherQuizOption(questionId, {
        optionText: "  x = 4  ",
        isCorrect: true,
      }),
    ).resolves.toEqual(option);
    await expect(
      updateTeacherQuizOption(questionId, optionId, { isCorrect: false }),
    ).resolves.toEqual({ ...option, isCorrect: false });
    await expect(
      reorderTeacherQuizOptions(questionId, { optionIds: [optionId] }),
    ).resolves.toEqual([option]);

    expect(
      fetchMock.mock.calls.map(([url, options]) => [url, options?.method]),
    ).toEqual([
      [`/api/v1/teacher/questions/${questionId}/options`, "POST"],
      [`/api/v1/teacher/questions/${questionId}/options/${optionId}`, "PATCH"],
      [`/api/v1/teacher/questions/${questionId}/options/order`, "PUT"],
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "same-origin",
      body: JSON.stringify({ optionText: "x = 4", isCorrect: true }),
    });
  });

  it("validates IDs and bodies before fetching and rejects malformed responses", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      reorderTeacherQuizOptions("invalid", { optionIds: [] }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      createTeacherQuizOption(questionId, { optionText: " " }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      reorderTeacherQuizOptions(questionId, {
        optionIds: [optionId, optionId],
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(fetchMock).not.toHaveBeenCalled();

    stubResponses({ body: { ...option, id: "bad" } });
    await expect(
      updateTeacherQuizOption(questionId, optionId, { optionText: "updated" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      title: "Invalid response",
    });
  });

  it.each([400, 401, 403, 404, 409, 500])(
    "preserves backend HTTP %i errors",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({ title: "Option request failed", status }),
            {
              status,
              headers: { "Content-Type": "application/problem+json" },
            },
          ),
        ),
      );

      await expect(
        updateTeacherQuizOption(questionId, optionId, { isCorrect: false }),
      ).rejects.toMatchObject({
        name: "ApiError",
        status,
        title: "Option request failed",
      });
    },
  );
});
