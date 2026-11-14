import { registrationRequestSchema } from "./identity.schemas.js";
import type { IdentityUser } from "./identity.repository.js";
import type { EmailService } from "../../infrastructure/email/email.service.js";
import {
  InvalidVerificationTokenError,
  type IssuedVerificationToken,
} from "./verification-token.service.js";

export interface PasswordRecoveryIdentityRepository {
  findUserByEmail(email: string): Promise<IdentityUser | null>;
}

export interface PasswordRecoveryTokenService {
  issueToken(
    userId: string,
    purpose: "password_reset",
  ): Promise<IssuedVerificationToken>;
  consumePasswordResetToken(token: string, passwordHash: string): Promise<void>;
}

export interface PasswordRecoveryServiceDependencies {
  identityRepository: PasswordRecoveryIdentityRepository;
  tokenService: PasswordRecoveryTokenService;
  emailService: EmailService;
  frontendUrl: string;
  hashPassword: (password: string) => Promise<string>;
}

export interface PasswordResetRequestResponse {
  message: string;
}

const resetRequestResponse: PasswordResetRequestResponse = {
  message:
    "If an account exists for that email, a password reset link will be sent.",
};

export function createPasswordRecoveryService({
  identityRepository,
  tokenService,
  emailService,
  frontendUrl,
  hashPassword,
}: PasswordRecoveryServiceDependencies) {
  const frontendOrigin = new URL(frontendUrl).origin;

  return {
    async requestReset(email: string): Promise<PasswordResetRequestResponse> {
      // Reuse registration's email normalization and validation.
      const normalizedEmail =
        registrationRequestSchema.shape.email.parse(email);
      const user = await identityRepository.findUserByEmail(normalizedEmail);

      if (user) {
        try {
          const { token } = await tokenService.issueToken(
            user.id,
            "password_reset",
          );
          const resetUrl = new URL("/reset-password", frontendOrigin);
          resetUrl.searchParams.set("token", token);

          await emailService.send({
            to: user.email,
            subject: "Reset your EduTrack password",
            text: `Reset your EduTrack password by opening this link: ${resetUrl.toString()}`,
            html: `<p>Reset your EduTrack password:</p><p><a href="${resetUrl.toString()}">Reset password</a></p>`,
          });
        } catch {
          // Keep the public response identical and do not expose a token or SMTP error.
        }
      }

      return { ...resetRequestResponse };
    },

    async resetPassword(
      token: string,
      newPassword: string,
    ): Promise<{ message: string }> {
      // Reuse the exact registration password policy (12–128 characters).
      const validatedPassword =
        registrationRequestSchema.shape.password.parse(newPassword);
      const passwordHash = await hashPassword(validatedPassword);

      // This operation consumes the token and changes the password and sessions
      // atomically. Invalid, expired, used, or wrong-purpose tokens are rejected.
      await tokenService.consumePasswordResetToken(token, passwordHash);

      return { message: "Password has been reset." };
    },
  };
}

export { InvalidVerificationTokenError };
