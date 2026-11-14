import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";

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

  it("preserves Home and the Not Found route", () => {
    expect(matchRoutes(routeConfig, "/")).not.toBeNull();

    const notFoundMatches = matchRoutes(routeConfig, "/unknown-page");
    expect(notFoundMatches?.at(-1)?.route.path).toBe("*");
  });

  it("does not define a functional login route yet", () => {
    const matches = matchRoutes(routeConfig, "/login");

    expect(matches?.at(-1)?.route.path).toBe("*");
  });
});
