import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentUserQueryKey } from "../../features/auth/hooks/auth-query-keys.js";
import WorkspaceSwitcher from "./WorkspaceSwitcher.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const userId = "00000000-0000-4000-8000-000000000001";

function stubCurrentUser(roles: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: userId,
          displayName: "Synthetic EduTrack User",
          email: "user@example.test",
          emailVerified: true,
          accountStatus: "active",
          roles,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    ),
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function renderSwitcher(
  initialPath = "/",
  initialRoles?: string[],
  onWorkspaceChange?: () => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  if (initialRoles) {
    queryClient.setQueryData(currentUserQueryKey, {
      id: userId,
      displayName: "Synthetic EduTrack User",
      email: "user@example.test",
      emailVerified: true,
      accountStatus: "active",
      roles: initialRoles,
    });
  }

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <WorkspaceSwitcher onWorkspaceChange={onWorkspaceChange} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...view, queryClient };
}

describe("WorkspaceSwitcher", () => {
  it("shows a simplified current-workspace label for a single-role user", async () => {
    stubCurrentUser(["student"]);

    renderSwitcher();

    expect(
      await screen.findByLabelText("Current workspace: Student Workspace"),
    ).toBeVisible();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("lists only backend-assigned workspaces for a multi-role user", async () => {
    stubCurrentUser(["student", "teacher", "administrator"]);

    renderSwitcher();

    const select = await screen.findByRole("combobox", { name: "Workspace" });
    expect(
      Array.from(select.querySelectorAll("option")).map(
        (option) => (option as HTMLOptionElement).value,
      ),
    ).toEqual(["student", "teacher", "administrator"]);
    expect(select).toHaveValue("student");
    expect(select.id).not.toBe("");
    expect(document.querySelector(`label[for="${select.id}"]`)).not.toBeNull();
  });

  it("selects Teacher for nested course, topic, lesson, and quiz routes", async () => {
    stubCurrentUser(["student", "teacher"]);

    renderSwitcher(
      "/teacher/courses/course-id/topics/topic-id/lessons/lesson-id/quizzes/quiz-id",
      ["student", "teacher"],
    );

    expect(
      await screen.findByRole("combobox", { name: "Workspace" }),
    ).toHaveValue("teacher");
  });

  it("adds the Teacher workspace only after the refreshed user response grants the role", async () => {
    let roles = ["student"];
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: userId,
            displayName: "Synthetic EduTrack User",
            email: "user@example.test",
            emailVerified: true,
            accountStatus: "active",
            roles,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { queryClient } = renderSwitcher();
    expect(
      await screen.findByLabelText("Current workspace: Student Workspace"),
    ).toBeVisible();

    roles = ["student", "teacher"];
    await queryClient.invalidateQueries({ queryKey: ["auth", "current-user"] });

    expect(
      await screen.findByRole("combobox", { name: "Workspace" }),
    ).toHaveValue("student");
    expect(
      screen.getByRole("option", { name: "Teacher Workspace" }),
    ).toBeInTheDocument();
  });

  it("removes the Teacher workspace after the refreshed user response revokes the role", async () => {
    let roles = ["student", "teacher"];
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: userId,
            displayName: "Synthetic EduTrack User",
            email: "user@example.test",
            emailVerified: true,
            accountStatus: "active",
            roles,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { queryClient } = renderSwitcher();
    const select = await screen.findByRole("combobox", { name: "Workspace" });
    expect(
      screen.getByRole("option", { name: "Teacher Workspace" }),
    ).toBeInTheDocument();

    roles = ["student"];
    await queryClient.invalidateQueries({ queryKey: ["auth", "current-user"] });

    expect(
      await screen.findByLabelText("Current workspace: Student Workspace"),
    ).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Workspace" })).toBeNull();
    expect(select).not.toBeInTheDocument();
  });

  it("keeps the current workspace stable during refresh and updates when roles change", async () => {
    let resolveRefresh!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { queryClient } = renderSwitcher("/teacher", ["student", "teacher"]);
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole("combobox", { name: "Workspace" })).toHaveValue(
      "teacher",
    );
    expect(screen.queryByText("Loading workspaces...")).toBeNull();

    resolveRefresh(
      new Response(
        JSON.stringify({
          id: userId,
          displayName: "Synthetic EduTrack User",
          email: "user@example.test",
          emailVerified: true,
          accountStatus: "active",
          roles: ["student"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    expect(
      await screen.findByLabelText("Current workspace: Student Workspace"),
    ).toBeVisible();
  });

  it("navigates to the configured landing route when switching workspaces", async () => {
    stubCurrentUser(["student", "teacher"]);

    const user = userEvent.setup();
    const onWorkspaceChange = vi.fn();
    renderSwitcher("/", undefined, onWorkspaceChange);

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Workspace" }),
      "teacher",
    );

    expect(screen.getByTestId("current-path")).toHaveTextContent("/teacher");
    expect(screen.getByRole("combobox", { name: "Workspace" })).toHaveValue(
      "teacher",
    );
    expect(onWorkspaceChange).toHaveBeenCalledTimes(1);
  });

  it("does not navigate to a workspace absent from the user's roles", async () => {
    stubCurrentUser(["student", "teacher"]);

    const onWorkspaceChange = vi.fn();
    renderSwitcher("/", undefined, onWorkspaceChange);

    const select = await screen.findByRole("combobox", { name: "Workspace" });
    expect(
      Array.from(select.querySelectorAll("option")).map(
        (option) => (option as HTMLOptionElement).value,
      ),
    ).not.toContain("administrator");

    fireEvent.change(select, { target: { value: "administrator" } });

    expect(screen.getByTestId("current-path")).toHaveTextContent("/");
    expect(onWorkspaceChange).not.toHaveBeenCalled();
  });

  it("selects Teacher when the URL is the Teacher workspace landing route", async () => {
    stubCurrentUser(["student", "teacher"]);

    renderSwitcher("/teacher");

    expect(
      await screen.findByRole("combobox", { name: "Workspace" }),
    ).toHaveValue("teacher");
  });

  it("selects Administrator for the existing review detail route", async () => {
    stubCurrentUser(["student", "administrator"]);

    renderSwitcher(
      "/admin/teacher-applications/550e8400-e29b-41d4-a716-446655440001",
    );

    expect(
      await screen.findByRole("combobox", { name: "Workspace" }),
    ).toHaveValue("administrator");
  });

  it("does not treat teacher application status as a Teacher workspace route", async () => {
    stubCurrentUser(["student", "teacher"]);

    renderSwitcher("/teacher/application-status");

    expect(
      await screen.findByRole("combobox", { name: "Workspace" }),
    ).toHaveValue("student");
  });

  it("shows a loading state while the current-user session is checked", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderSwitcher();

    expect(screen.getByText("Loading workspaces...")).toBeVisible();
  });

  it("offers sign-in for an unauthenticated user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Authentication required",
            status: 401,
            detail: "A valid session is required.",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    renderSwitcher();

    expect(
      await screen.findByRole("link", {
        name: "Sign in to access a workspace",
      }),
    ).toHaveAttribute("href", "/login");
  });

  it("shows a safe retry state when session lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private server details", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    renderSwitcher();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't check your session.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByText("private server details")).toBeNull();
  });
});
