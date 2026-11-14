import { afterEach, describe, expect, it, vi } from "vitest";

import {
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "./auth.api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const registration = {
  displayName: "Ada Student",
  email: "ada@example.test",
  password: "a synthetic test passphrase",
};

const responseBody = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Ada Student",
  email: "ada@example.test",
};

describe("registerUser", () => {
  it("posts normalized registration data and returns the shared response contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      registerUser({
        ...registration,
        displayName: "  Ada Student  ",
        email: " ADA@example.test ",
      }),
    ).resolves.toEqual(responseBody);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/register",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(registration),
      }),
    );
  });

  it("preserves safe API validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Invalid request",
            status: 400,
            detail: "The request body is invalid.",
            errors: [{ field: "email", message: "Enter a valid email." }],
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    await expect(registerUser(registration)).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      validationErrors: [{ field: "email", message: "Enter a valid email." }],
    });
  });

  it("rejects a successful response that does not match the shared contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "unexpected" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(registerUser(registration)).rejects.toMatchObject({
      name: "ApiError",
      status: 201,
      detail: "The server returned an unexpected registration response.",
    });
  });
});

describe("verifyEmail", () => {
  const token = "synthetic-verification-token-value-long-enough";

  it("posts the token to the verification endpoint and returns the shared response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Email verified." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyEmail({ token })).resolves.toEqual({
      message: "Email verified.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/verify-email",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      }),
    );
  });

  it("preserves the API's invalid, expired, or consumed token response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Invalid or expired token",
            status: 400,
            detail: "The token is invalid, expired, or already used.",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    await expect(verifyEmail({ token })).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
    });
  });
});

describe("requestPasswordReset", () => {
  const request = { email: "ada@example.test" };
  const response = {
    message:
      "If an account exists for that email, a password reset link will be sent.",
  };

  it("posts the normalized email and returns the shared response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestPasswordReset({ email: " ADA@example.test " }),
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/forgot-password",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(request),
      }),
    );
  });

  it("preserves API failures without exposing internal response data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private server diagnostic", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    await expect(requestPasswordReset(request)).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
    });

    await expect(requestPasswordReset(request)).rejects.not.toThrow(
      "private server diagnostic",
    );
  });
});

describe("resetPassword", () => {
  const request = {
    token: "synthetic-reset-token-value-long-enough",
    newPassword: "a synthetic replacement passphrase",
  };

  it("posts the reset token and new password and returns the shared response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Password has been reset." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resetPassword(request)).resolves.toEqual({
      message: "Password has been reset.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/reset-password",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(request),
      }),
    );
  });

  it("preserves invalid, expired, and consumed-token API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: "Invalid or expired token",
            status: 400,
            detail: "The token is invalid, expired, or already used.",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    await expect(resetPassword(request)).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
    });
  });
});
