import type { CurrentUserResponse, CurrentUserRole } from "@edutrack/contracts";

export type WorkspaceDefinition<
  Role extends CurrentUserRole = CurrentUserRole,
> = Readonly<{
  id: Role;
  role: Role;
  label: string;
  landingRoute: string;
}>;

type WorkspaceMap = {
  readonly [Role in CurrentUserRole]: WorkspaceDefinition<Role>;
};

/**
 * Workspace destinations are planned route roots. This task defines them but
 * does not register routes or implement workspace pages.
 */
export const workspaceConfig = {
  student: {
    id: "student",
    role: "student",
    label: "Student Workspace",
    landingRoute: "/",
  },
  teacher: {
    id: "teacher",
    role: "teacher",
    label: "Teacher Workspace",
    landingRoute: "/teacher",
  },
  administrator: {
    id: "administrator",
    role: "administrator",
    label: "Administrator Workspace",
    landingRoute: "/admin/teacher-applications",
  },
} satisfies WorkspaceMap;

export type WorkspaceId = keyof typeof workspaceConfig;
export type Workspace = (typeof workspaceConfig)[WorkspaceId];

function hasAuthenticatedUser(
  user: CurrentUserResponse | null | undefined,
): user is CurrentUserResponse {
  return user !== null && user !== undefined;
}

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === "string" && Object.hasOwn(workspaceConfig, value);
}

/**
 * Returns workspaces authorized by roles in the backend current-user response.
 * The returned order also defines the default preference: Student, Teacher,
 * then Administrator.
 */
export function getAvailableWorkspaces(
  user: CurrentUserResponse | null | undefined,
): Workspace[] {
  if (!hasAuthenticatedUser(user)) {
    return [];
  }

  return Object.values(workspaceConfig).filter((workspace) =>
    user.roles.includes(workspace.role),
  );
}

export function isWorkspaceAvailable(
  selectedWorkspaceId: unknown,
  user: CurrentUserResponse | null | undefined,
): selectedWorkspaceId is WorkspaceId {
  if (!hasAuthenticatedUser(user) || !isWorkspaceId(selectedWorkspaceId)) {
    return false;
  }

  return user.roles.includes(workspaceConfig[selectedWorkspaceId].role);
}

/**
 * Keeps a requested workspace only if the backend-assigned roles allow it.
 * Otherwise, selects the first available workspace in the defined safe order.
 */
export function resolveWorkspaceSelection(
  user: CurrentUserResponse | null | undefined,
  selectedWorkspaceId?: unknown,
): Workspace | null {
  if (isWorkspaceAvailable(selectedWorkspaceId, user)) {
    return workspaceConfig[selectedWorkspaceId];
  }

  return getAvailableWorkspaces(user)[0] ?? null;
}
