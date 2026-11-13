import { healthResponseSchema } from "@edutrack/contracts";
import type { FastifyPluginAsync } from "fastify";

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get("/health", async () =>
    healthResponseSchema.parse({
      status: "ok",
    }),
  );
};
