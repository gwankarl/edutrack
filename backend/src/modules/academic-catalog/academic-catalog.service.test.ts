import type {
  AcademicLevelResponse,
  SubjectResponse,
} from "@edutrack/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAcademicCatalogService } from "./academic-catalog.service.js";

const academicLevels: AcademicLevelResponse[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    code: "form-1",
    name: "Form 1",
    educationStage: "lower_secondary",
    sortOrder: 1,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    code: "form-2",
    name: "Form 2",
    educationStage: "lower_secondary",
    sortOrder: 2,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440003",
    code: "form-3",
    name: "Form 3",
    educationStage: "lower_secondary",
    sortOrder: 3,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440004",
    code: "form-4",
    name: "Form 4",
    educationStage: "lower_secondary",
    sortOrder: 4,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440005",
    code: "form-5",
    name: "Form 5",
    educationStage: "lower_secondary",
    sortOrder: 5,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440006",
    code: "lower-sixth",
    name: "Lower Sixth",
    educationStage: "upper_secondary",
    sortOrder: 6,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440007",
    code: "upper-sixth",
    name: "Upper Sixth",
    educationStage: "upper_secondary",
    sortOrder: 7,
  },
];

const subjects: SubjectResponse[] = [
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
];

function makeService() {
  const repository = {
    listAcademicLevels: vi.fn(async () => academicLevels),
    listSubjects: vi.fn(async () => subjects),
  };

  return {
    service: createAcademicCatalogService({ repository }),
    repository,
  };
}

describe("academic catalog service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all seven academic levels in repository order", async () => {
    const { service, repository } = makeService();

    await expect(service.listAcademicLevels()).resolves.toEqual({
      items: academicLevels,
    });

    expect(repository.listAcademicLevels).toHaveBeenCalledOnce();
    expect(
      (await service.listAcademicLevels()).items.map(
        (level) => level.sortOrder,
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns subjects in repository alphabetical order", async () => {
    const { service, repository } = makeService();

    await expect(service.listSubjects()).resolves.toEqual({ items: subjects });

    expect(repository.listSubjects).toHaveBeenCalledOnce();
    expect(
      (await service.listSubjects()).items.map((subject) => subject.name),
    ).toEqual(["Mathematics", "Physics"]);
  });

  it("returns empty lists when the repository has no catalog records", async () => {
    const { service, repository } = makeService();
    repository.listAcademicLevels.mockResolvedValue([]);
    repository.listSubjects.mockResolvedValue([]);

    await expect(service.listAcademicLevels()).resolves.toEqual({ items: [] });
    await expect(service.listSubjects()).resolves.toEqual({ items: [] });
  });

  it("propagates repository failures without disguising database errors", async () => {
    const { service, repository } = makeService();
    const levelsError = new Error("Academic levels query failed.");
    const subjectsError = new Error("Subjects query failed.");

    repository.listAcademicLevels.mockRejectedValue(levelsError);
    repository.listSubjects.mockRejectedValue(subjectsError);

    await expect(service.listAcademicLevels()).rejects.toBe(levelsError);
    await expect(service.listSubjects()).rejects.toBe(subjectsError);
  });
});
