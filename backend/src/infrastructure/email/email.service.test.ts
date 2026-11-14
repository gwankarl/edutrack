import { describe, expect, it, vi } from "vitest";

import {
  createEmailService,
  EmailConfigurationError,
  EmailDeliveryError,
  type EmailEnvironment,
  type EmailMessage,
  type EmailTransport,
} from "./email.service.js";

const emailEnvironment: EmailEnvironment = {
  SMTP_HOST: "sandbox.smtp.example",
  SMTP_PORT: 587,
  SMTP_USER: "synthetic-sandbox-user",
  SMTP_PASSWORD: "synthetic-sandbox-password",
  EMAIL_FROM: "EduTrack <no-reply@example.test>",
};

const message: EmailMessage = {
  to: "student@example.test",
  subject: "Synthetic test message",
  text: "This is a mocked email test.",
};

describe("createEmailService", () => {
  it("creates an SMTP transport and sends using the configured sender", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "synthetic-message-id" }));
    const transport: EmailTransport = { sendMail };
    const createTransport = vi.fn((): EmailTransport => transport);

    const emailService = createEmailService(emailEnvironment, createTransport);

    await emailService.send(message);

    expect(createTransport).toHaveBeenCalledWith({
      host: "sandbox.smtp.example",
      port: 587,
      secure: false,
      auth: {
        user: "synthetic-sandbox-user",
        pass: "synthetic-sandbox-password",
      },
    });
    expect(sendMail).toHaveBeenCalledWith({
      ...message,
      from: "EduTrack <no-reply@example.test>",
    });
  });

  it("uses implicit TLS for SMTP port 465", async () => {
    const transport: EmailTransport = {
      sendMail: vi.fn(async () => ({ messageId: "synthetic-message-id" })),
    };
    const createTransport = vi.fn((): EmailTransport => transport);

    createEmailService(
      {
        ...emailEnvironment,
        SMTP_PORT: 465,
      },
      createTransport,
    );

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 465,
        secure: true,
      }),
    );
  });

  it("rejects incomplete SMTP configuration without creating a transport", () => {
    const createTransport = vi.fn((): EmailTransport => ({
      sendMail: vi.fn(),
    }));

    expect(() =>
      createEmailService(
        {
          SMTP_HOST: "sandbox.smtp.example",
          SMTP_PORT: undefined,
          SMTP_USER: undefined,
          SMTP_PASSWORD: undefined,
          EMAIL_FROM: undefined,
        },
        createTransport,
      ),
    ).toThrow(EmailConfigurationError);

    expect(createTransport).not.toHaveBeenCalled();
  });

  it("does not expose SMTP failure details", async () => {
    const sendMail = vi.fn(async () => {
      throw new Error("Authentication failed: synthetic-sandbox-password");
    });
    const transport: EmailTransport = { sendMail };

    const emailService = createEmailService(emailEnvironment, () => transport);

    let caughtError: unknown;

    try {
      await emailService.send(message);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(EmailDeliveryError);
    expect(String(caughtError)).not.toContain("synthetic-sandbox-password");
    expect(caughtError).not.toHaveProperty("cause");
  });
});
