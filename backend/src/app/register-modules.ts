import type { FastifyInstance } from "fastify";

import type { Environment } from "../infrastructure/config/env.js";
import type { AppDependencies } from "./create-app.js";
import { healthRoute } from "../modules/health/health-route.js";
import { identityRoutes } from "../modules/identity/identity.routes.js";
import { teacherApplicationRoutes } from "../modules/teachers/teacher-application.routes.js";

export async function registerModules(
  app: FastifyInstance,
  environment: Environment,
  dependencies: AppDependencies,
): Promise<void> {
  await app.register(healthRoute, { prefix: "/api/v1" });

  await app.register(identityRoutes, {
    prefix: "/api/v1",
    environment,
    emailTransportFactory: dependencies.emailTransportFactory,
  });

  await app.register(teacherApplicationRoutes, {
    prefix: "/api/v1",
    environment,
  });
}
