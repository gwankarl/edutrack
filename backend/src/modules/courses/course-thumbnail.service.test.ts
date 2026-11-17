import { describe, expect, it, vi } from "vitest";

import type { Environment } from "../../infrastructure/config/env.js";
import {
  CourseThumbnailNotEditableError,
  CourseThumbnailNotFoundError,
  createCourseThumbnailService,
  type CourseThumbnailStorage,
} from "./course-thumbnail.service.js";

const environment: Environment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 5000,
  FRONTEND_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@localhost:5432/edutrack_test",
  SESSION_TTL_SECONDS: 604800,
};

const asset = {
  publicId: "edutrack/course-thumbnails/synthetic",
  assetId: "synthetic-asset-id",
  secureUrl: "https://res.cloudinary.com/demo/image/upload/sample.webp",
  width: 640,
  height: 360,
  format: "webp" as const,
};

function setup(
  options: {
    result?: "updated" | "not_found" | "not_editable";
    destroyFails?: boolean;
  } = {},
) {
  const storage: CourseThumbnailStorage = {
    upload: vi.fn(async () => asset),
    destroy: vi.fn(async () => {
      if (options.destroyFails)
        throw new Error("provider details must not escape");
    }),
  };
  const repository = {
    replaceThumbnail: vi.fn(async () => ({
      kind: options.result ?? ("updated" as const),
    })),
    removeThumbnail: vi.fn(async () => ({
      kind: options.result ?? ("updated" as const),
    })),
    queueCleanup: vi.fn(async () => undefined),
    listPendingCleanup: vi.fn(
      async (): Promise<
        Array<{
          id: string;
          publicId: string;
          assetId: string;
          attemptCount: number;
        }>
      > => [],
    ),
    completeCleanup: vi.fn(async () => undefined),
    retryCleanup: vi.fn(async () => undefined),
  };
  const identityRepository = {
    findRolesByUserId: vi.fn(async () => ["teacher"]),
  };
  const teacherProfileRepository = {
    findByUserId: vi.fn(async () => ({ id: "teacher-profile" })),
  };
  const service = createCourseThumbnailService({
    environment,
    storage,
    repository,
    identityRepository,
    teacherProfileRepository,
  });
  return {
    service,
    storage,
    repository,
    identityRepository,
    teacherProfileRepository,
  };
}

describe("course thumbnail service", () => {
  it("uploads and persists image metadata for the authenticated teacher profile", async () => {
    const { service, storage, repository } = setup();
    const result = await service.upload(
      "trusted-user-id",
      "course-id",
      Buffer.from("image"),
      "webp",
    );

    expect(storage.upload).toHaveBeenCalledWith(Buffer.from("image"), "webp");
    expect(repository.replaceThumbnail).toHaveBeenCalledWith(
      "course-id",
      "teacher-profile",
      asset,
    );
    expect(result).toEqual({
      url: asset.secureUrl,
      width: 640,
      height: 360,
      format: "webp",
    });
  });

  it("does not accept a user without the Teacher role or a profile", async () => {
    const deps = setup();
    deps.identityRepository.findRolesByUserId.mockResolvedValue(["student"]);
    await expect(
      deps.service.upload(
        "student-id",
        "course-id",
        Buffer.from("image"),
        "png",
      ),
    ).rejects.toThrow("approved Teacher");
    expect(deps.storage.upload).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", CourseThumbnailNotFoundError],
    ["not_editable", CourseThumbnailNotEditableError],
  ] as const)(
    "cleans newly uploaded assets when course mutation returns %s",
    async (result, ErrorType) => {
      const deps = setup({ result });
      await expect(
        deps.service.upload(
          "teacher-user",
          "course-id",
          Buffer.from("image"),
          "png",
        ),
      ).rejects.toBeInstanceOf(ErrorType);
      expect(deps.storage.destroy).toHaveBeenCalledWith(asset.publicId);
      expect(deps.repository.queueCleanup).not.toHaveBeenCalled();
    },
  );

  it("queues compensation when Cloudinary cannot delete an uncommitted upload", async () => {
    const deps = setup({ result: "not_found", destroyFails: true });
    await expect(
      deps.service.upload(
        "teacher-user",
        "course-id",
        Buffer.from("image"),
        "png",
      ),
    ).rejects.toBeInstanceOf(CourseThumbnailNotFoundError);
    expect(deps.repository.queueCleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        publicId: asset.publicId,
        assetId: asset.assetId,
      }),
    );
  });

  it("removes only through the repository and processes the durable cleanup queue", async () => {
    const deps = setup();
    await expect(
      deps.service.remove("teacher-user", "course-id"),
    ).resolves.toBeUndefined();
    expect(deps.repository.removeThumbnail).toHaveBeenCalledWith(
      "course-id",
      "teacher-profile",
    );
    expect(deps.repository.listPendingCleanup).toHaveBeenCalled();
  });

  it("keeps an upload successful when the cleanup scan fails after persistence", async () => {
    const deps = setup();
    deps.repository.listPendingCleanup.mockRejectedValueOnce(
      new Error("synthetic cleanup database failure"),
    );

    await expect(
      deps.service.upload(
        "teacher-user",
        "course-id",
        Buffer.from("image"),
        "webp",
      ),
    ).resolves.toEqual({
      url: asset.secureUrl,
      width: asset.width,
      height: asset.height,
      format: asset.format,
    });

    expect(deps.repository.replaceThumbnail).toHaveBeenCalledOnce();
  });

  it("keeps a removal successful when the cleanup scan fails after persistence", async () => {
    const deps = setup();
    deps.repository.listPendingCleanup.mockRejectedValueOnce(
      new Error("synthetic cleanup database failure"),
    );

    await expect(
      deps.service.remove("teacher-user", "course-id"),
    ).resolves.toBeUndefined();

    expect(deps.repository.removeThumbnail).toHaveBeenCalledOnce();
  });

  it("deletes queued old assets and schedules retry after a provider failure", async () => {
    const deps = setup({ destroyFails: true });
    vi.mocked(deps.repository.listPendingCleanup).mockResolvedValue([
      {
        id: "cleanup-id",
        publicId: asset.publicId,
        assetId: asset.assetId,
        attemptCount: 2,
      },
    ]);

    await deps.service.processPendingCleanup();

    expect(deps.storage.destroy).toHaveBeenCalledWith(asset.publicId);
    expect(deps.repository.retryCleanup).toHaveBeenCalledWith(
      "cleanup-id",
      expect.any(Number),
    );
    expect(deps.repository.completeCleanup).not.toHaveBeenCalled();
  });
});
