import type { FastifyInstance } from "fastify";

import { healthRoute } from "../modules/health/health-route.js";

export async function registerModules(app: FastifyInstance): Promise<void> {
  await app.register(healthRoute, { prefix: "/api/v1" });
}
