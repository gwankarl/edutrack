import type { IdentityUser } from "../../modules/identity/identity.repository.js";
import type { UserRole } from "../../infrastructure/database/schema/role-assignments.js";

export interface AuthContext {
  userId: string;
  user: IdentityUser;
  roles: UserRole[];
}

declare module "fastify" {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}
