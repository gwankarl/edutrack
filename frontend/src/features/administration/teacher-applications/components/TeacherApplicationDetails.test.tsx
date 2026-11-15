import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AdminTeacherApplicationResponse } from "@edutrack/contracts";

import TeacherApplicationDetails from "./TeacherApplicationDetails.js";

const pendingApplication = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  applicant: {
    id: "550e8400-e29b-41d4-a716-446655440002",
    displayName: "Synthetic Applicant",
    email: "applicant@example.test",
  },
  motivation: "I want to support students.",
  qualifications: "Synthetic teaching background.",
  submittedAt: "2026-11-14T12:00:00.000Z",
  status: "pending",
  reviewedAt: null,
  reviewer: null,
  rejectionReason: null,
  reviewNotes: null,
} satisfies AdminTeacherApplicationResponse;

const rejectedApplication = {
  ...pendingApplication,
  status: "rejected",
  reviewedAt: "2026-11-15T12:00:00.000Z",
  reviewer: {
    id: "550e8400-e29b-41d4-a716-446655440003",
    displayName: "Synthetic Administrator",
    email: "administrator@example.test",
  },
  rejectionReason: "Please provide more classroom experience.",
  reviewNotes: "Follow up if the applicant submits a new application.",
} satisfies AdminTeacherApplicationResponse;

describe("TeacherApplicationDetails", () => {
  it("displays applicant information and a pending status", () => {
    render(<TeacherApplicationDetails application={pendingApplication} />);

    expect(
      screen.getByRole("heading", { name: "Application details" }),
    ).toBeVisible();
    expect(screen.getByText("Synthetic Applicant")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "applicant@example.test" }),
    ).toHaveAttribute("href", "mailto:applicant@example.test");
    expect(screen.getByText("Synthetic teaching background.")).toBeVisible();
    expect(screen.getByText("I want to support students.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Pending");
  });

  it("shows reviewer details and internal review information when present", () => {
    render(<TeacherApplicationDetails application={rejectedApplication} />);

    expect(screen.getByRole("status")).toHaveTextContent("Rejected");
    expect(screen.getByText("Reviewed by")).toBeVisible();
    expect(screen.getByText("Synthetic Administrator")).toBeVisible();
    expect(
      screen.getByText("Please provide more classroom experience."),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Internal review notes" }),
    ).toBeVisible();
    expect(
      screen.getByText("Follow up if the applicant submits a new application."),
    ).toBeVisible();
  });
});
