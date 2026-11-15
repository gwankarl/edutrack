import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../../lib/api/api-error.js";
import { useTeacherApplicationDecision } from "../hooks/useTeacherApplicationDecision.js";
import TeacherApplicationDecisionForm from "./TeacherApplicationDecisionForm.js";

vi.mock("../hooks/useTeacherApplicationDecision.js", () => ({
  useTeacherApplicationDecision: vi.fn(),
}));

const applicationId = "550e8400-e29b-41d4-a716-446655440001";
const decisionHookMock = vi.mocked(useTeacherApplicationDecision);

function renderForm(
  status: "pending" | "approved" | "rejected" = "pending",
  onConflict = vi.fn(),
) {
  return render(
    <TeacherApplicationDecisionForm
      applicationId={applicationId}
      applicationStatus={status}
      onConflict={onConflict}
    />,
  );
}

function mockIdleDecision(
  submitDecision = vi.fn().mockResolvedValue(undefined),
) {
  decisionHookMock.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isIdle: true,
    isPending: false,
    isSuccess: false,
    reset: vi.fn(),
    submitDecision,
  } as unknown as ReturnType<typeof useTeacherApplicationDecision>);

  return submitDecision;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIdleDecision();
});

describe("TeacherApplicationDecisionForm", () => {
  it("requires a second explicit confirmation before approving", async () => {
    const user = userEvent.setup();
    const submitDecision = mockIdleDecision();

    renderForm();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.type(
      screen.getByLabelText("Administrator review notes (optional)"),
      "Reviewed and approved.",
    );
    await user.click(screen.getByRole("button", { name: "Review approval" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "grant the applicant the Teacher role",
    );
    expect(submitDecision).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Approve application" }),
    );

    await waitFor(() =>
      expect(submitDecision).toHaveBeenCalledWith({
        decision: "approve",
        applicationId,
        input: { reviewNotes: "Reviewed and approved." },
      }),
    );
  });

  it("allows approval without optional review notes", async () => {
    const user = userEvent.setup();
    const submitDecision = mockIdleDecision();

    renderForm();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Review approval" }));
    await user.click(
      screen.getByRole("button", { name: "Approve application" }),
    );

    await waitFor(() =>
      expect(submitDecision).toHaveBeenCalledWith({
        decision: "approve",
        applicationId,
        input: {},
      }),
    );
  });

  it("requires a rejection reason and submits it after dialog confirmation", async () => {
    const user = userEvent.setup();
    const submitDecision = mockIdleDecision();

    renderForm();

    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.click(screen.getByRole("button", { name: "Review rejection" }));

    expect(screen.getByText(/at least 1 character|too small/i)).toBeVisible();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(submitDecision).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText(/rejection reason/i),
      "Please provide relevant teaching experience.",
    );
    await user.click(screen.getByRole("button", { name: "Review rejection" }));
    expect(screen.getByRole("alertdialog")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Reject application" }),
    );

    await waitFor(() =>
      expect(submitDecision).toHaveBeenCalledWith({
        decision: "reject",
        applicationId,
        input: {
          rejectionReason: "Please provide relevant teaching experience.",
        },
      }),
    );
  });

  it("closes the confirmation dialog with Escape and restores focus", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Review approval" }));

    const dialog = screen.getByRole("alertdialog");
    const cancelButton = within(dialog).getByRole("button", { name: "Cancel" });
    expect(cancelButton).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review approval" }),
      ).toHaveFocus(),
    );
  });

  it.each(["approved", "rejected"] as const)(
    "hides decision actions for a %s application",
    (status) => {
      renderForm(status);

      expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    },
  );

  it("disables decision controls while a request is pending", () => {
    decisionHookMock.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isIdle: false,
      isPending: true,
      isSuccess: false,
      reset: vi.fn(),
      submitDecision: vi.fn(),
    } as unknown as ReturnType<typeof useTeacherApplicationDecision>);

    renderForm();

    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("shows success feedback after a decision completes", () => {
    decisionHookMock.mockReturnValue({
      data: {
        applicationId,
        status: "approved",
        reviewedAt: "2026-11-15T12:00:00.000Z",
        reviewer: {
          id: "550e8400-e29b-41d4-a716-446655440002",
          displayName: "Synthetic Administrator",
          email: "administrator@example.test",
        },
      },
      error: null,
      isError: false,
      isIdle: false,
      isPending: false,
      isSuccess: true,
      reset: vi.fn(),
      submitDecision: vi.fn(),
    } as unknown as ReturnType<typeof useTeacherApplicationDecision>);

    renderForm();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Application approved",
    );
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("shows a conflict message and refresh action for HTTP 409", async () => {
    const user = userEvent.setup();
    const onConflict = vi.fn();

    decisionHookMock.mockReturnValue({
      data: undefined,
      error: new ApiError({
        status: 409,
        title: "Application already reviewed",
        detail: "Private details should not be surfaced.",
      }),
      isError: true,
      isIdle: false,
      isPending: false,
      isSuccess: false,
      reset: vi.fn(),
      submitDecision: vi.fn(),
    } as unknown as ReturnType<typeof useTeacherApplicationDecision>);

    renderForm("pending", onConflict);
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Another administrator may have already reviewed this application.",
    );
    expect(
      screen.queryByText("Private details should not be surfaced."),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Refresh application" }),
    );
    expect(onConflict).toHaveBeenCalledOnce();
  });

  it("shows a safe server-error message", async () => {
    const user = userEvent.setup();

    decisionHookMock.mockReturnValue({
      data: undefined,
      error: new ApiError({
        status: 500,
        title: "Server error",
        detail: "Internal diagnostic text must stay private.",
      }),
      isError: true,
      isIdle: false,
      isPending: false,
      isSuccess: false,
      reset: vi.fn(),
      submitDecision: vi.fn(),
    } as unknown as ReturnType<typeof useTeacherApplicationDecision>);

    renderForm();
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't submit this decision. Please try again.",
    );
    expect(
      screen.queryByText("Internal diagnostic text must stay private."),
    ).toBeNull();
  });
});
