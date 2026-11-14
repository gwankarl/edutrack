import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";

import ProtectedRoute from "./ProtectedRoute.js";
import { routeConfig } from "./router.js";

describe("application routes", () => {
  it.each([
    ["/register", "register"],
    ["/registration-confirmation", "registration-confirmation"],
    ["/verify-email", "verify-email"],
    ["/forgot-password", "forgot-password"],
    ["/reset-password", "reset-password"],
  ])("matches the public route %s", (pathname, expectedPath) => {
    const matches = matchRoutes(routeConfig, pathname);

    expect(matches?.at(-1)?.route.path).toBe(expectedPath);
  });

  it.each([
    ["/teacher/apply", "teacher/apply"],
    ["/teacher/application-status", "teacher/application-status"],
  ])("protects the %s route", (pathname, expectedPath) => {
    const matches = matchRoutes(routeConfig, pathname);

    expect(matches?.at(-1)?.route.path).toBe(expectedPath);
    expect(
      matches?.some((match) => match.route.Component === ProtectedRoute),
    ).toBe(true);
  });

  it("preserves Home and the Not Found route", () => {
    expect(matchRoutes(routeConfig, "/")).not.toBeNull();

    const notFoundMatches = matchRoutes(routeConfig, "/unknown-page");
    expect(notFoundMatches?.at(-1)?.route.path).toBe("*");
  });

  it("matches the login route", () => {
    const matches = matchRoutes(routeConfig, "/login");

    expect(matches?.at(-1)?.route.path).toBe("login");
  });

  it("places Profile under the authenticated route guard", () => {
    const matches = matchRoutes(routeConfig, "/profile");

    expect(matches?.at(-1)?.route.path).toBe("profile");
    expect(
      matches?.some((match) => match.route.Component === ProtectedRoute),
    ).toBe(true);
  });
});
