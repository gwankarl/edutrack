import {
  registrationRequestSchema,
  registrationResponseSchema,
  type RegistrationResponse,
} from "./identity.schemas.js";
import type {
  CreateIdentityUserInput,
  IdentityUser,
} from "./identity.repository.js";

export interface IdentityRegistrationRepository {
  createUser(input: CreateIdentityUserInput): Promise<IdentityUser>;
}

export interface IdentityEmailVerificationService {
  sendVerificationEmail(
    user: Pick<IdentityUser, "id" | "email">,
  ): Promise<void>;
}

export interface IdentityServiceDependencies {
  repository: IdentityRegistrationRepository;
  hashPassword: (password: string) => Promise<string>;
  emailVerificationService: IdentityEmailVerificationService;
}

export function createIdentityService({
  repository,
  hashPassword,
  emailVerificationService,
}: IdentityServiceDependencies) {
  return {
    async register(input: unknown): Promise<RegistrationResponse> {
      const request = registrationRequestSchema.parse(input);
      const passwordHash = await hashPassword(request.password);

      const user = await repository.createUser({
        email: request.email,
        displayName: request.displayName,
        passwordHash,
      });

      await emailVerificationService.sendVerificationEmail({
        id: user.id,
        email: user.email,
      });

      return registrationResponseSchema.parse(user);
    },
  };
}
