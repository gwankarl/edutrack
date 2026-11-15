import type { FastifyInstance, FastifyPluginAsync } from "fastify";

import {
  academicLevelListResponseSchema,
  subjectListResponseSchema,
} from "@edutrack/contracts";
import { createAcademicCatalogRepository } from "./academic-catalog.repository.js";
import { createAcademicCatalogService } from "./academic-catalog.service.js";

type AcademicCatalogService = Pick<
  ReturnType<typeof createAcademicCatalogService>,
  "listAcademicLevels" | "listSubjects"
>;

export interface AcademicCatalogRouteServices {
  catalog: AcademicCatalogService;
}

export interface AcademicCatalogRouteOptions {
  services?: AcademicCatalogRouteServices;
}

function createCatalogService(app: FastifyInstance): AcademicCatalogService {
  const repository = createAcademicCatalogRepository(app.db);

  return createAcademicCatalogService({ repository });
}

export const academicCatalogRoutes: FastifyPluginAsync<
  AcademicCatalogRouteOptions
> = async (app, { services }) => {
  const catalog = services?.catalog ?? createCatalogService(app);

  app.get("/academic-levels", async (_request, reply) => {
    const response = await catalog.listAcademicLevels();

    return reply
      .code(200)
      .send(academicLevelListResponseSchema.parse(response));
  });

  app.get("/subjects", async (_request, reply) => {
    const response = await catalog.listSubjects();

    return reply.code(200).send(subjectListResponseSchema.parse(response));
  });
};
