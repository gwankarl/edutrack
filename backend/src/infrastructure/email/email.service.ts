import nodemailer from "nodemailer";

import type { Environment } from "../config/env.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailTransport {
  sendMail(
    message: EmailMessage & {
      from: string;
    },
  ): Promise<unknown>;
}

export type EmailTransportFactory = (
  options: SmtpTransportOptions,
) => EmailTransport;

export class EmailConfigurationError extends Error {
  constructor() {
    super("Email delivery is not configured.");
    this.name = "EmailConfigurationError";
  }
}

export class EmailDeliveryError extends Error {
  constructor() {
    super("Email delivery failed.");
    this.name = "EmailDeliveryError";
  }
}

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}

export type EmailEnvironment = Pick<
  Environment,
  "SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASSWORD" | "EMAIL_FROM"
>;

function createNodemailerTransport(
  options: SmtpTransportOptions,
): EmailTransport {
  const transporter = nodemailer.createTransport(options);

  return {
    sendMail: (message) => transporter.sendMail(message),
  };
}

export function createEmailService(
  environment: EmailEnvironment,
  createTransport: EmailTransportFactory = createNodemailerTransport,
): EmailService {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } =
    environment;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !EMAIL_FROM) {
    throw new EmailConfigurationError();
  }

  const transport = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });

  return {
    async send(message): Promise<void> {
      try {
        await transport.sendMail({
          ...message,
          from: EMAIL_FROM,
        });
      } catch {
        // Do not attach or log the underlying error; it may contain SMTP details.
        throw new EmailDeliveryError();
      }
    },
  };
}
