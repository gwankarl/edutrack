import {
  currentUserResponseSchema,
  registrationRequestSchema,
  registrationResponseSchema,
  type CurrentUserResponse,
  type RegistrationResponse,
} from "./identity.schemas.js";
import type {
  CreateIdentityUserInput,
  IdentityCurrentUserRecord,
  IdentityUser,
} from "./identity.repository.js";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";

export interface IdentityRegistrationRepository {
  createUser(input: CreateIdentityUserInput): Promise<IdentityUser>;
  findCurrentUserById(
    userId: string,
  ): Promise<IdentityCurrentUserRecord | null>;
  findRolesByUserId(userId: string): Promise<UserRole[]>;
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

    async getCurrentUser(userId: string): Promise<CurrentUserResponse | null> {
      const user = await repository.findCurrentUserById(userId);

      if (!user) {
        return null;
      }

      const roles = await repository.findRolesByUserId(userId);

      return currentUserResponseSchema.parse({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        emailVerified: user.emailVerifiedAt !== null,
        accountStatus: user.accountStatus,
        roles,
      });
    },
  };
}
