import type { CurrentUserResponse, CurrentUserRole } from "@edutrack/contracts";
import { describe, expect, it } from "vitest";

import {
  getAvailableWorkspaces,
  isWorkspaceAvailable,
  isWorkspaceId,
  resolveWorkspaceSelection,
  workspaceConfig,
} from "./workspace-config.js";

function makeUser(roles: CurrentUserRole[]): CurrentUserResponse {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    displayName: "Synthetic EduTrack User",
    email: "user@example.test",
    emailVerified: true,
    accountStatus: "active",
    roles,
  };
}

describe("workspace configuration", () => {
  it("uses existing landing routes for each workspace", () => {
    expect(workspaceConfig.student.landingRoute).toBe("/");
    expect(workspaceConfig.teacher.landingRoute).toBe("/teacher");
    expect(workspaceConfig.administrator.landingRoute).toBe(
      "/admin/teacher-applications",
    );
  });

  it("provides only the Student workspace to a Student", () => {
    const user = makeUser(["student"]);

    expect(getAvailableWorkspaces(user).map(({ id }) => id)).toEqual([
      "student",
    ]);
    expect(resolveWorkspaceSelection(user)?.id).toBe("student");
  });

  it("provides only the Teacher workspace to a Teacher", () => {
    const user = makeUser(["teacher"]);

    expect(getAvailableWorkspaces(user).map(({ id }) => id)).toEqual([
      "teacher",
    ]);
    expect(isWorkspaceAvailable("student", user)).toBe(false);
    expect(isWorkspaceAvailable("administrator", user)).toBe(false);
  });

  it("provides only the Administrator workspace to an Administrator", () => {
    const user = makeUser(["administrator"]);

    expect(getAvailableWorkspaces(user).map(({ id }) => id)).toEqual([
      "administrator",
    ]);
  });

  it("supports multiple roles and preserves Student access after promotion", () => {
    const user = makeUser(["student", "teacher"]);

    expect(getAvailableWorkspaces(user).map(({ id }) => id)).toEqual([
      "student",
      "teacher",
    ]);
    expect(isWorkspaceAvailable("student", user)).toBe(true);
    expect(resolveWorkspaceSelection(user)?.id).toBe("student");
    expect(resolveWorkspaceSelection(user, "teacher")?.id).toBe("teacher");
  });

  it("allows a selected Administrator workspace for a multi-role user", () => {
    const user = makeUser(["student", "administrator"]);

    expect(getAvailableWorkspaces(user).map(({ id }) => id)).toEqual([
      "student",
      "administrator",
    ]);
    expect(resolveWorkspaceSelection(user, "administrator")?.id).toBe(
      "administrator",
    );
  });

  it("rejects unknown or unassigned workspace selections and falls back safely", () => {
    const user = makeUser(["teacher"]);

    expect(isWorkspaceId("not-a-workspace")).toBe(false);
    expect(isWorkspaceAvailable("not-a-workspace", user)).toBe(false);
    expect(isWorkspaceAvailable("administrator", user)).toBe(false);
    expect(resolveWorkspaceSelection(user, "administrator")?.id).toBe(
      "teacher",
    );
  });

  it("returns no workspaces for unauthenticated users", () => {
    expect(getAvailableWorkspaces(null)).toEqual([]);
    expect(getAvailableWorkspaces(undefined)).toEqual([]);
    expect(isWorkspaceAvailable("student", null)).toBe(false);
    expect(resolveWorkspaceSelection(null)).toBeNull();
  });
});
