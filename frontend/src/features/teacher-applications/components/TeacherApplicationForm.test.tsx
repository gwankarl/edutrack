import type { PropsWithChildren } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import TeacherApplicationForm from "./TeacherApplicationForm.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = {
  motivation: "I want to support learners.",
  qualifications: "Synthetic teaching experience.",
};

const pendingApplication = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  status: "pending",
  ...request,
  submittedAt: "2026-11-14T12:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
};

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(currentUserQueryKey, {
    id: "550e8400-e29b-41d4-a716-446655440002",
    displayName: "Synthetic Applicant",
    email: "applicant@example.test",
    emailVerified: true,
    accountStatus: "active",
    roles: ["student"],
  });

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return {
    ...render(<TeacherApplicationForm />, { wrapper: Wrapper }),
    queryClient,
  };
}

describe("TeacherApplicationForm", () => {
  it("shows accessible field errors when submitted empty", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderForm();

    await user.click(
      screen.getByRole("button", { name: "Submit application" }),
    );

    expect(
      await screen.findByText("Enter why you want to become a teacher."),
    ).toBeTruthy();
    expect(
      screen.getByText("Enter your qualifications or relevant background."),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits both fields and displays accessible success feedback", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(pendingApplication), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderForm();

    await user.type(screen.getByLabelText(/Motivation/), request.motivation);
    await user.type(
      screen.getByLabelText(/Qualifications and background/),
      request.qualifications,
    );
    await user.click(
      screen.getByRole("button", { name: "Submit application" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your application was submitted successfully.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teacher-applications",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(request),
      }),
    );
  });

  it("disables submission while the API request is pending", async () => {
    const user = userEvent.setup();
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderForm();

    await user.type(screen.getByLabelText(/Motivation/), request.motivation);
    await user.type(
      screen.getByLabelText(/Qualifications and background/),
      request.qualifications,
    );
    await user.click(
      screen.getByRole("button", { name: "Submit application" }),
    );

    const pendingButton = await screen.findByRole("button", {
      name: "Submitting application...",
    });
    expect(pendingButton).toBeDisabled();

    resolveResponse(
      new Response(JSON.stringify(pendingApplication), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Submit application" }),
      ).toBeEnabled();
    });
  });

  it("shows a safe duplicate-application message", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Application already pending",
            status: 409,
            detail: "A pending teacher application already exists.",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    renderForm();

    await user.type(screen.getByLabelText(/Motivation/), request.motivation);
    await user.type(
      screen.getByLabelText(/Qualifications and background/),
      request.qualifications,
    );
    await user.click(
      screen.getByRole("button", { name: "Submit application" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You already have a pending application or the Teacher role.",
    );
  });

  it("supports keyboard submission", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(pendingApplication), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderForm();

    await user.tab();
    expect(screen.getByLabelText(/Motivation/)).toHaveFocus();
    await user.type(screen.getByLabelText(/Motivation/), request.motivation);
    await user.tab();
    expect(
      screen.getByLabelText(/Qualifications and background/),
    ).toHaveFocus();
    await user.type(
      screen.getByLabelText(/Qualifications and background/),
      request.qualifications,
    );
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Submit application" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
