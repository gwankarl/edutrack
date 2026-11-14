import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import UserMenu from "./UserMenu.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const authenticatedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Ada Student",
  email: "ada@example.test",
  emailVerified: true,
  accountStatus: "active",
  roles: ["student"],
};

function renderUserMenu() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UserMenu", () => {
  it("shows a neutral loading state while checking the session", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    renderUserMenu();

    expect(screen.getByRole("status")).toHaveTextContent("Checking session...");
    expect(screen.queryByRole("link", { name: "Login" })).toBeNull();
    expect(screen.queryByRole("button", { name: /account menu/i })).toBeNull();
  });

  it("shows Login when the session is unauthenticated", async () => {
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

    renderUserMenu();

    expect(await screen.findByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("shows the display name, Profile link, and Logout action when authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(authenticatedUser), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const user = userEvent.setup();
    renderUserMenu();

    const menuButton = await screen.findByRole("button", {
      name: "Ada Student account menu",
    });
    await user.click(menuButton);

    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("button", { name: "Logout" })).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Assigned roles" }),
    ).toHaveTextContent("student");
  });

  it("closes the account menu and restores focus when Escape is pressed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(authenticatedUser), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const user = userEvent.setup();
    renderUserMenu();

    const trigger = await screen.findByRole("button", {
      name: "Ada Student account menu",
    });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("navigation", { name: "Account menu" }),
    ).toBeTruthy();

    await user.keyboard("{Escape}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    expect(
      screen.queryByRole("navigation", { name: "Account menu" }),
    ).toBeNull();
  });

  it("shows pending logout feedback and switches to Login after logout succeeds", async () => {
    let resolveLogout!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(authenticatedUser), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveLogout = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderUserMenu();

    await user.click(
      await screen.findByRole("button", {
        name: "Ada Student account menu",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(
      screen.getByRole("button", { name: "Logging out..." }),
    ).toBeDisabled();

    resolveLogout(
      new Response(JSON.stringify({ message: "Logged out." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(await screen.findByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("keeps the authenticated menu and shows safe feedback if logout fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(authenticatedUser), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("private server diagnostic", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderUserMenu();

    await user.click(
      await screen.findByRole("button", {
        name: "Ada Student account menu",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t log you out. Please try again.",
    );
    expect(screen.queryByText("private server diagnostic")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Ada Student account menu" }),
    ).toBeTruthy();
  });

  it("does not show Login when the session check has a temporary error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private server diagnostic", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    renderUserMenu();

    expect(await screen.findByText("Session status unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Login" })).toBeNull();
    expect(screen.queryByText("private server diagnostic")).toBeNull();
  });
});
