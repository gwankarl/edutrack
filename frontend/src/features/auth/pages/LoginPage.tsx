import { useLocation, useNavigate } from "react-router";
import type { LoginRequest } from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import LoginForm from "../components/LoginForm.js";
import { useLogin } from "../hooks/useLogin.js";

function getLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return "Email or password is incorrect.";
  }

  return "We couldn’t sign you in right now. Please try again.";
}

function getSafePostLoginPath(state: unknown): string {
  const from =
    typeof state === "object" && state !== null && "from" in state
      ? (state as { from?: unknown }).from
      : undefined;

  if (
    typeof from !== "string" ||
    !from.startsWith("/") ||
    from.startsWith("//")
  ) {
    return "/profile";
  }

  try {
    const destination = new URL(from, window.location.origin);

    if (destination.origin !== window.location.origin) {
      return "/profile";
    }

    const publicAuthPaths = new Set([
      "/login",
      "/register",
      "/registration-confirmation",
      "/verify-email",
      "/forgot-password",
      "/reset-password",
    ]);

    if (publicAuthPaths.has(destination.pathname)) {
      return "/profile";
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/profile";
  }
}

export default function LoginPage() {
  const login = useLogin();

  const location = useLocation();
  const navigate = useNavigate();

  async function submitLogin(values: LoginRequest): Promise<void> {
    try {
      await login.mutateAsync(values);
      navigate(getSafePostLoginPath(location.state), { replace: true });
    } catch {
      // Mutation state displays a safe message; do not log credentials.
    }
  }

  return (
    <section
      aria-labelledby="login-heading"
      className="mx-auto max-w-xl space-y-6 rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-8"
    >
      <div className="space-y-2">
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="login-heading"
        >
          Sign in to EduTrack
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Enter your email and password to continue.
        </p>
      </div>

      <LoginForm
        errorMessage={
          login.isError ? getLoginErrorMessage(login.error) : undefined
        }
        isPending={login.isPending}
        onSubmit={submitLogin}
        successMessage={login.isSuccess ? "Signed in successfully." : undefined}
      />
    </section>
  );
}
