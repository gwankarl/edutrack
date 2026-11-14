import type { Environment } from "../config/env.js";

export function getSessionCookieName(
  environment: Pick<Environment, "NODE_ENV">,
): string {
  return environment.NODE_ENV === "production"
    ? "__Host-edutrack_session"
    : "edutrack_session";
}

function getBaseCookieOptions(environment: Pick<Environment, "NODE_ENV">) {
  return {
    httpOnly: true,
    secure: environment.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export function getSessionCookieOptions(
  environment: Pick<Environment, "NODE_ENV">,
  expiresAt: Date,
) {
  return {
    ...getBaseCookieOptions(environment),
    expires: expiresAt,
  };
}

export function getClearedSessionCookieOptions(
  environment: Pick<Environment, "NODE_ENV">,
) {
  return {
    ...getBaseCookieOptions(environment),
    expires: new Date(0),
    maxAge: 0,
  };
}
