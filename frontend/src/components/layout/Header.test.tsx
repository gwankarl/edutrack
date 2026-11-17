import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import Header from "./Header.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function CurrentPath() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function stubTeacherNavigation(
  roles: string[],
  application: {
    id: string;
    status: "pending" | "approved" | "rejected";
    motivation: string;
    qualifications: string;
    submittedAt: string;
    reviewedAt: string | null;
    rejectionReason: string | null;
  } | null,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/v1/auth/me") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "00000000-0000-4000-8000-000000000001",
              displayName: "Ada Student",
              email: "ada@example.test",
              emailVerified: true,
              accountStatus: "active",
              roles,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }

      if (url === "/api/v1/teacher-applications/me") {
        return Promise.resolve(
          new Response(JSON.stringify({ application }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    }),
  );
}

const pendingApplication = {
  id: "00000000-0000-4000-8000-000000000002",
  status: "pending" as const,
  motivation: "Synthetic motivation.",
  qualifications: "Synthetic qualifications.",
  submittedAt: "2026-11-14T12:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
};

const rejectedApplication = {
  ...pendingApplication,
  status: "rejected" as const,
  reviewedAt: "2026-11-15T12:00:00.000Z",
  rejectionReason: "Please provide more relevant experience.",
};

function renderHeader(initialPath = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Header />
        <CurrentPath />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Header", () => {
  it("keeps Home and Register links and uses client-side navigation", async () => {
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

    const user = userEvent.setup();
    renderHeader();

    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeTruthy();
    expect(screen.getByRole("banner").firstElementChild).toHaveClass(
      "flex-col",
      "sm:flex-row",
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(await screen.findByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      "/login",
    );

    await user.click(screen.getByRole("link", { name: "Register" }));

    expect(screen.getByLabelText("Current path")).toHaveTextContent(
      "/register",
    );
  });

  it("shows the mobile Teacher menu on Teacher routes and opens the drawer", async () => {
    stubTeacherNavigation(["student", "teacher"], null);

    const user = userEvent.setup();
    renderHeader("/teacher/courses/course-id");

    const menuButton = await screen.findByRole("button", {
      name: "Open Teacher navigation",
    });
    expect(menuButton).toHaveClass("lg:hidden");

    await user.click(menuButton);

    expect(
      await screen.findByRole("dialog", { name: "Teacher navigation" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Close Teacher navigation" }),
    ).toBeVisible();
  });

  it("keeps the EduTrack brand linked to Home", () => {
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

    renderHeader();

    expect(screen.getByRole("link", { name: "EduTrack home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows Become a Teacher when the signed-in user has no application", async () => {
    stubTeacherNavigation(["student"], null);
    renderHeader();

    expect(
      await screen.findByLabelText("Current workspace: Student Workspace"),
    ).toBeVisible();
    expect(
      await screen.findByRole("link", { name: "Become a Teacher" }),
    ).toHaveAttribute("href", "/teacher/apply");
    expect(
      screen.queryByRole("link", { name: "Application Status" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Teacher Applications" }),
    ).toBeNull();
  });

  it("shows Teacher Applications to Administrators with multiple roles", async () => {
    stubTeacherNavigation(["student", "administrator"], null);
    renderHeader();

    expect(
      await screen.findByRole("link", { name: "Teacher Applications" }),
    ).toHaveAttribute("href", "/admin/teacher-applications");
    expect(
      await screen.findByRole("link", { name: "Become a Teacher" }),
    ).toHaveAttribute("href", "/teacher/apply");
  });

  it("offers only assigned workspaces and switches to the Teacher landing route", async () => {
    stubTeacherNavigation(["student", "teacher"], null);

    const user = userEvent.setup();
    renderHeader();

    const switcher = await screen.findByRole("combobox", {
      name: "Workspace",
    });
    expect(
      Array.from(switcher.querySelectorAll("option")).map(
        (option) => (option as HTMLOptionElement).value,
      ),
    ).toEqual(["student", "teacher"]);

    await user.selectOptions(switcher, "teacher");

    expect(screen.getByLabelText("Current path")).toHaveTextContent("/teacher");

    await user.click(
      await screen.findByRole("button", {
        name: "Open Teacher navigation",
      }),
    );
    const drawer = await screen.findByRole("dialog", {
      name: "Teacher navigation",
    });
    expect(
      within(drawer).getByRole("combobox", { name: "Workspace" }),
    ).toHaveValue("teacher");
  });

  it("switches Administrators to the existing review route", async () => {
    stubTeacherNavigation(["student", "administrator"], null);

    const user = userEvent.setup();
    renderHeader();

    const switcher = await screen.findByRole("combobox", {
      name: "Workspace",
    });
    expect(
      Array.from(switcher.querySelectorAll("option")).map(
        (option) => (option as HTMLOptionElement).value,
      ),
    ).toEqual(["student", "administrator"]);

    await user.selectOptions(switcher, "administrator");

    expect(screen.getByLabelText("Current path")).toHaveTextContent(
      "/admin/teacher-applications",
    );
  });

  it("shows Application Status for an applicant with a pending application", async () => {
    stubTeacherNavigation(["student"], pendingApplication);
    renderHeader();

    expect(
      await screen.findByRole("link", { name: "Application Status" }),
    ).toHaveAttribute("href", "/teacher/application-status");
    expect(screen.queryByRole("link", { name: "Become a Teacher" })).toBeNull();
  });

  it("lets rejected applicants open status and apply again", async () => {
    stubTeacherNavigation(["student"], rejectedApplication);
    renderHeader();

    expect(
      await screen.findByRole("link", { name: "Application Status" }),
    ).toHaveAttribute("href", "/teacher/application-status");
    expect(
      screen.getByRole("link", { name: "Become a Teacher" }),
    ).toHaveAttribute("href", "/teacher/apply");
  });

  it("keeps global branding and account controls without duplicating the Teacher sidebar switcher", async () => {
    stubTeacherNavigation(["student", "teacher"], null);
    renderHeader("/teacher/courses/course-id/topics");

    expect(
      await screen.findByRole("link", { name: "EduTrack home" }),
    ).toHaveAttribute("href", "/");
    expect(
      await screen.findByRole("button", { name: "Ada Student account menu" }),
    ).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Workspace" })).toBeNull();
  });

  it("hides teacher application links from users who already have the Teacher role", async () => {
    stubTeacherNavigation(["student", "teacher"], pendingApplication);
    renderHeader();

    expect(
      await screen.findByRole("button", { name: "Ada Student account menu" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Application Status" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Become a Teacher" })).toBeNull();
  });

  it("does not flash teacher application links while session data is loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderHeader();

    expect(
      screen.queryByRole("link", { name: "Application Status" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Become a Teacher" })).toBeNull();
  });
});
