import { useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import { currentUserQueryKey } from "../../features/auth/hooks/auth-query-keys.js";
import TeacherNavigationDrawer from "./TeacherNavigationDrawer.js";

const currentUser = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Synthetic Teacher",
  email: "teacher@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student", "teacher"],
};

function CurrentPath() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        aria-controls="teacher-navigation-dialog"
        aria-expanded={open}
        className="lg:hidden"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        Open mobile navigation
      </button>
      <TeacherNavigationDrawer
        onClose={() => setOpen(false)}
        open={open}
        triggerRef={triggerRef}
      />
      <CurrentPath />
    </>
  );
}

function renderDrawer(initialPath = "/teacher") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(currentUserQueryKey, currentUser);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <DrawerHarness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeacherNavigationDrawer", () => {
  it("opens from the menu button, focuses the close button, and locks background scrolling", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(
      screen.getByRole("button", { name: "Open mobile navigation" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Teacher navigation" }),
    ).toBeVisible();
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "id",
      "teacher-navigation-dialog",
    );
    expect(
      screen.getByRole("button", { name: "Open mobile navigation" }),
    ).toHaveAttribute("aria-controls", "teacher-navigation-dialog");
    expect(
      screen.getByRole("button", { name: "Close Teacher navigation" }),
    ).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    expect(
      screen.getByRole("button", { name: "Open mobile navigation" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on backdrop click and restores focus and scrolling", async () => {
    const user = userEvent.setup();
    renderDrawer();

    const trigger = screen.getByRole("button", {
      name: "Open mobile navigation",
    });
    await user.click(trigger);
    await user.click(
      screen.getByRole("button", {
        name: "Close Teacher navigation backdrop",
      }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("closes on Escape and restores focus to the menu button", async () => {
    const user = userEvent.setup();
    renderDrawer();

    const trigger = screen.getByRole("button", {
      name: "Open mobile navigation",
    });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes from the close button and restores focus and scrolling", async () => {
    const user = userEvent.setup();
    renderDrawer();

    const trigger = screen.getByRole("button", {
      name: "Open mobile navigation",
    });
    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: "Close Teacher navigation" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("traps keyboard focus within the open drawer", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(
      screen.getByRole("button", { name: "Open mobile navigation" }),
    );

    const closeButton = screen.getByRole("button", {
      name: "Close Teacher navigation",
    });
    const lastLink = screen.getByRole("link", { name: "My Profile" });

    await user.tab({ shift: true });
    expect(lastLink).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it("closes after client-side navigation and keeps the Teacher route", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(
      screen.getByRole("button", { name: "Open mobile navigation" }),
    );
    await user.click(screen.getByRole("link", { name: "My Courses" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Current path")).toHaveTextContent(
      "/teacher/courses",
    );
  });

  it("closes immediately when an authorized workspace is selected", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(
      screen.getByRole("button", { name: "Open mobile navigation" }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Workspace" }),
      "student",
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Current path")).toHaveTextContent("/");
  });

  it("shows the active nested course link and only authorized workspaces in the drawer", async () => {
    const user = userEvent.setup();
    renderDrawer(
      "/teacher/courses/course-id/topics/topic-id/lessons/lesson-id/quizzes/quiz-id",
    );

    await user.click(
      screen.getByRole("button", { name: "Open mobile navigation" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Teacher navigation" });
    expect(
      within(dialog).getByRole("link", { name: "My Courses" }),
    ).toHaveAttribute("aria-current", "page");

    const workspaceSelect = within(dialog).getByRole("combobox", {
      name: "Workspace",
    });
    expect(workspaceSelect).toHaveValue("teacher");
    expect(
      Array.from(
        workspaceSelect.querySelectorAll("option"),
        (option) => (option as HTMLOptionElement).value,
      ),
    ).toEqual(["student", "teacher"]);
  });

  it("uses mobile-only drawer styling", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(
      screen.getByRole("button", { name: "Open mobile navigation" }),
    );

    expect(screen.getByRole("dialog").parentElement).toHaveClass("lg:hidden");
    expect(
      screen.getByRole("button", { name: "Open mobile navigation" }),
    ).toHaveClass("lg:hidden");
  });

  it("closes when the viewport changes to desktop width", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(
      screen.getByRole("button", { name: "Open mobile navigation" }),
    );

    const originalInnerWidth = Object.getOwnPropertyDescriptor(
      window,
      "innerWidth",
    );

    try {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 1280,
      });
      fireEvent(window, new Event("resize"));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      if (originalInnerWidth) {
        Object.defineProperty(window, "innerWidth", originalInnerWidth);
      } else {
        Reflect.deleteProperty(window, "innerWidth");
      }
    }
  });
});
