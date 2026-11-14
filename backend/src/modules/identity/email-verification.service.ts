import type { EmailService } from "../../infrastructure/email/email.service.js";
import type { IssuedVerificationToken } from "./verification-token.service.js";

export interface EmailVerificationUser {
  id: string;
  email: string;
}

export interface EmailVerificationTokenService {
  issueToken(
    userId: string,
    purpose: "email_verification",
  ): Promise<IssuedVerificationToken>;
  consumeEmailVerificationToken(
    token: string,
  ): Promise<{ userId: string; emailVerifiedAt: Date }>;
}

export interface EmailVerificationServiceDependencies {
  tokenService: EmailVerificationTokenService;
  emailService: EmailService;
  frontendUrl: string;
}

export class EmailVerificationDeliveryError extends Error {
  constructor() {
    super("The verification email could not be sent.");
    this.name = "EmailVerificationDeliveryError";
  }
}

export function createEmailVerificationService({
  tokenService,
  emailService,
  frontendUrl,
}: EmailVerificationServiceDependencies) {
  const frontendOrigin = new URL(frontendUrl).origin;

  return {
    async sendVerificationEmail(user: EmailVerificationUser): Promise<void> {
      const { token } = await tokenService.issueToken(
        user.id,
        "email_verification",
      );

      const verificationUrl = new URL("/verify-email", frontendOrigin);
      verificationUrl.searchParams.set("token", token);

      try {
        await emailService.send({
          to: user.email,
          subject: "Verify your EduTrack email",
          text: `Verify your EduTrack email by opening this link: ${verificationUrl.toString()}`,
          html: `<p>Verify your EduTrack email:</p><p><a href="${verificationUrl.toString()}">Verify email</a></p>`,
        });
      } catch {
        // Do not attach unexpected errors: they may include message or SMTP data.
        throw new EmailVerificationDeliveryError();
      }
    },

    async verifyEmail(
      token: string,
    ): Promise<{ userId: string; emailVerifiedAt: Date }> {
      return tokenService.consumeEmailVerificationToken(token);
    },
  };
}
