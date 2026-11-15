import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { AdminTeacherApplicationResponse } from "@edutrack/contracts";

import TeacherApplicationsTable from "./TeacherApplicationsTable.js";

const application = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  applicant: {
    id: "550e8400-e29b-41d4-a716-446655440002",
    displayName: "Synthetic Applicant",
    email: "applicant@example.test",
  },
  motivation: "I want to support students.",
  qualifications: "Synthetic teaching background.",
  submittedAt: "2026-01-10T12:00:00.000Z",
  status: "pending",
  reviewedAt: null,
  reviewer: null,
  rejectionReason: null,
  reviewNotes: null,
} satisfies AdminTeacherApplicationResponse;

describe("TeacherApplicationsTable", () => {
  it("shows applicant details, status, date, and the planned details link", () => {
    render(
      <MemoryRouter>
        <TeacherApplicationsTable applications={[application]} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("table", { name: "Teacher applications" }),
    ).toBeVisible();
    expect(screen.getByText("Synthetic Applicant")).toBeVisible();
    expect(screen.getByText("applicant@example.test")).toBeVisible();
    expect(screen.getByText("Pending")).toBeVisible();

    expect(
      screen.getByRole("link", {
        name: "View details for Synthetic Applicant",
      }),
    ).toHaveAttribute(
      "href",
      "/admin/teacher-applications/550e8400-e29b-41d4-a716-446655440001",
    );
  });

  it("renders an accessible table for an empty result set", () => {
    render(
      <MemoryRouter>
        <TeacherApplicationsTable applications={[]} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("table", { name: "Teacher applications" }),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /View Details/ })).toBeNull();
  });
});
