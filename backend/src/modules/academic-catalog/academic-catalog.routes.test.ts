import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AcademicLevelListResponse,
  SubjectListResponse,
} from "@edutrack/contracts";
import { registerErrorHandler } from "../../shared/errors/error-handler.js";
import {
  academicCatalogRoutes,
  type AcademicCatalogRouteServices,
} from "./academic-catalog.routes.js";

const levels: AcademicLevelListResponse = {
  items: [
    {
      id: "550e8400-e29b-41d4-a716-446655440001",
      code: "form-1",
      name: "Form 1",
      educationStage: "lower_secondary",
      sortOrder: 1,
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440006",
      code: "lower-sixth",
      name: "Lower Sixth",
      educationStage: "upper_secondary",
      sortOrder: 6,
    },
  ],
};

const subjectList: SubjectListResponse = {
  items: [
    {
      id: "550e8400-e29b-41d4-a716-446655440010",
      code: "mathematics",
      name: "Mathematics",
      sortOrder: 1,
    },
    {
      id: "550e8400-e29b-41d4-a716-446655440011",
      code: "physics",
      name: "Physics",
      sortOrder: 2,
    },
  ],
};

const apps: FastifyInstance[] = [];

async function createRouteHarness() {
  const app = Fastify({ logger: false });
  const services: AcademicCatalogRouteServices = {
    catalog: {
      listAcademicLevels: vi.fn(async () => levels),
      listSubjects: vi.fn(async () => subjectList),
    },
  };

  registerErrorHandler(app);

  await app.register(academicCatalogRoutes, {
    prefix: "/api/v1",
    services,
  });

  apps.push(app);

  return { app, services };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("academic catalog routes", () => {
  it("returns academic levels publicly in repository order", async () => {
    const { app, services } = await createRouteHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/academic-levels",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(levels);
    expect(services.catalog.listAcademicLevels).toHaveBeenCalledOnce();
  });

  it("returns subjects publicly in repository order", async () => {
    const { app, services } = await createRouteHarness();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/subjects",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(subjectList);
    expect(services.catalog.listSubjects).toHaveBeenCalledOnce();
  });

  it("returns HTTP 200 with empty catalog lists", async () => {
    const { app, services } = await createRouteHarness();
    vi.mocked(services.catalog.listAcademicLevels).mockResolvedValue({
      items: [],
    });
    vi.mocked(services.catalog.listSubjects).mockResolvedValue({ items: [] });

    const levelsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/academic-levels",
    });
    const subjectsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/subjects",
    });

    expect(levelsResponse.statusCode).toBe(200);
    expect(levelsResponse.json()).toEqual({ items: [] });
    expect(subjectsResponse.statusCode).toBe(200);
    expect(subjectsResponse.json()).toEqual({ items: [] });
  });

  it("returns generic Problem Details when the levels service fails", async () => {
    const { app, services } = await createRouteHarness();
    vi.mocked(services.catalog.listAcademicLevels).mockRejectedValue(
      new Error("Sensitive database diagnostic."),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/academic-levels",
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:internal-error",
      status: 500,
      detail: "An unexpected error occurred.",
    });
    expect(response.body).not.toContain("Sensitive database diagnostic.");
  });

  it("returns generic Problem Details when the subjects service fails", async () => {
    const { app, services } = await createRouteHarness();
    vi.mocked(services.catalog.listSubjects).mockRejectedValue(
      new Error("Sensitive database diagnostic."),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/subjects",
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(response.json()).toMatchObject({
      type: "urn:edutrack:problem:internal-error",
      status: 500,
      detail: "An unexpected error occurred.",
    });
    expect(response.body).not.toContain("Sensitive database diagnostic.");
  });
});
