import { render, screen } from "@testing-library/react";
import type { CurrentUserResponse } from "@edutrack/contracts";
import { describe, expect, it } from "vitest";

import ProfileDetails from "./ProfileDetails.js";

const studentProfile: CurrentUserResponse = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Ada Student",
  email: "ada@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student"],
};

describe("ProfileDetails", () => {
  it("displays the safe profile fields and verification state", () => {
    render(<ProfileDetails user={studentProfile} />);

    expect(screen.getByText("Ada Student")).toBeTruthy();
    expect(screen.getByText("ada@example.test")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText("Student")).toBeTruthy();
  });

  it("displays multiple assigned roles and an unverified email state", () => {
    render(
      <ProfileDetails
        user={{
          ...studentProfile,
          emailVerified: false,
          accountStatus: "pending_review",
          roles: ["student", "teacher"],
        }}
      />,
    );

    expect(screen.getByText("Pending Review")).toBeTruthy();
    expect(screen.getByText("Not verified")).toBeTruthy();
    expect(screen.getByText("Student")).toBeTruthy();
    expect(screen.getByText("Teacher")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Assigned roles" })).toBeTruthy();
  });
});
