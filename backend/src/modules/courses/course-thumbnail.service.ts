import { v2 as cloudinary } from "cloudinary";

import type { Environment } from "../../infrastructure/config/env.js";
import type { CourseThumbnailMetadata } from "./course-thumbnail.repository.js";

export interface CourseThumbnailRepository {
  replaceThumbnail(
    courseId: string,
    teacherId: string,
    metadata: CourseThumbnailMetadata,
  ): Promise<
    { kind: "updated" } | { kind: "not_found" } | { kind: "not_editable" }
  >;
  removeThumbnail(
    courseId: string,
    teacherId: string,
  ): Promise<
    { kind: "updated" } | { kind: "not_found" } | { kind: "not_editable" }
  >;
  queueCleanup(
    asset: Pick<CourseThumbnailMetadata, "publicId" | "assetId">,
  ): Promise<void>;
  listPendingCleanup(limit?: number): Promise<
    Array<{
      id: string;
      publicId: string;
      assetId: string;
      attemptCount: number;
    }>
  >;
  completeCleanup(id: string): Promise<void>;
  retryCleanup(id: string, delayMilliseconds: number): Promise<void>;
}

export interface CourseThumbnailIdentityRepository {
  findRolesByUserId(userId: string): Promise<string[]>;
}

export interface CourseThumbnailProfileRepository {
  findByUserId(userId: string): Promise<{ id: string } | null>;
}

export type ThumbnailUploadResult = CourseThumbnailMetadata;

export interface CourseThumbnailStorage {
  upload(
    buffer: Buffer,
    format: CourseThumbnailMetadata["format"],
  ): Promise<ThumbnailUploadResult>;
  destroy(publicId: string): Promise<void>;
}

export class CourseThumbnailConfigurationError extends Error {
  constructor() {
    super("Course image storage is not configured.");
    this.name = "CourseThumbnailConfigurationError";
  }
}

export class CourseThumbnailStorageError extends Error {
  constructor() {
    super("The course image could not be stored.");
    this.name = "CourseThumbnailStorageError";
  }
}

export class CourseThumbnailNotFoundError extends Error {
  constructor() {
    super("Course was not found.");
    this.name = "CourseThumbnailNotFoundError";
  }
}

export class CourseThumbnailNotEditableError extends Error {
  constructor() {
    super("Only draft courses can change their thumbnail.");
    this.name = "CourseThumbnailNotEditableError";
  }
}

export class CourseThumbnailTeacherRequiredError extends Error {
  constructor() {
    super("An approved Teacher account is required.");
    this.name = "CourseThumbnailTeacherRequiredError";
  }
}

export function createCloudinaryThumbnailStorage(
  environment: Environment,
): CourseThumbnailStorage | null {
  if (
    !environment.CLOUDINARY_CLOUD_NAME ||
    !environment.CLOUDINARY_API_KEY ||
    !environment.CLOUDINARY_API_SECRET
  ) {
    return null;
  }

  cloudinary.config({
    cloud_name: environment.CLOUDINARY_CLOUD_NAME,
    api_key: environment.CLOUDINARY_API_KEY,
    api_secret: environment.CLOUDINARY_API_SECRET,
    secure: true,
  });

  return {
    upload(buffer, format) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "edutrack/course-thumbnails",
            resource_type: "image",
            format,
            overwrite: false,
            unique_filename: true,
          },
          (error, result) => {
            if (
              error ||
              !result?.public_id ||
              !result.asset_id ||
              !result.secure_url
            ) {
              reject(new CourseThumbnailStorageError());
              return;
            }

            resolve({
              publicId: result.public_id,
              assetId: result.asset_id,
              secureUrl: result.secure_url,
              width: result.width,
              height: result.height,
              format,
            });
          },
        );
        stream.end(buffer);
      });
    },
    async destroy(publicId) {
      try {
        const result = await cloudinary.uploader.destroy(publicId, {
          invalidate: true,
          resource_type: "image",
        });
        if (result.result !== "ok" && result.result !== "not found") {
          throw new CourseThumbnailStorageError();
        }
      } catch {
        throw new CourseThumbnailStorageError();
      }
    },
  };
}

export function createCourseThumbnailService(dependencies: {
  environment: Environment;
  repository: CourseThumbnailRepository;
  identityRepository: CourseThumbnailIdentityRepository;
  teacherProfileRepository: CourseThumbnailProfileRepository;
  storage?: CourseThumbnailStorage | null;
}) {
  const storage =
    dependencies.storage === undefined
      ? createCloudinaryThumbnailStorage(dependencies.environment)
      : dependencies.storage;

  async function resolveTeacherId(userId: string): Promise<string> {
    const [roles, profile] = await Promise.all([
      dependencies.identityRepository.findRolesByUserId(userId),
      dependencies.teacherProfileRepository.findByUserId(userId),
    ]);
    if (!roles.includes("teacher") || !profile) {
      throw new CourseThumbnailTeacherRequiredError();
    }
    return profile.id;
  }

  async function cleanupNewAsset(
    asset: Pick<CourseThumbnailMetadata, "publicId" | "assetId">,
  ): Promise<void> {
    if (!storage) {
      return;
    }
    try {
      await storage.destroy(asset.publicId);
    } catch {
      await dependencies.repository.queueCleanup(asset).catch(() => undefined);
    }
  }

  async function processPendingCleanup(): Promise<void> {
    if (!storage) {
      return;
    }
    const pending = await dependencies.repository.listPendingCleanup();
    for (const asset of pending) {
      try {
        await storage.destroy(asset.publicId);
        await dependencies.repository
          .completeCleanup(asset.id)
          .catch(() => undefined);
      } catch {
        const backoff = Math.min(
          24 * 60 * 60_000,
          60_000 * 2 ** Math.min(asset.attemptCount, 10),
        );
        await dependencies.repository
          .retryCleanup(asset.id, backoff)
          .catch(() => undefined);
      }
    }
  }

  async function processPendingCleanupBestEffort(): Promise<void> {
    try {
      await processPendingCleanup();
    } catch {
      // The thumbnail mutation already committed; the scheduled worker retries cleanup.
    }
  }

  return {
    async upload(
      userId: string,
      courseId: string,
      buffer: Buffer,
      format: CourseThumbnailMetadata["format"],
    ) {
      if (!storage) {
        throw new CourseThumbnailConfigurationError();
      }
      const teacherId = await resolveTeacherId(userId);
      let uploaded: ThumbnailUploadResult;
      try {
        uploaded = await storage.upload(buffer, format);
      } catch {
        throw new CourseThumbnailStorageError();
      }

      let result: Awaited<
        ReturnType<CourseThumbnailRepository["replaceThumbnail"]>
      >;
      try {
        result = await dependencies.repository.replaceThumbnail(
          courseId,
          teacherId,
          uploaded,
        );
      } catch (error) {
        await cleanupNewAsset(uploaded);
        throw error;
      }

      if (result.kind !== "updated") {
        await cleanupNewAsset(uploaded);
        throw result.kind === "not_found"
          ? new CourseThumbnailNotFoundError()
          : new CourseThumbnailNotEditableError();
      }

      await processPendingCleanupBestEffort();
      return {
        url: uploaded.secureUrl,
        width: uploaded.width,
        height: uploaded.height,
        format: uploaded.format,
      };
    },

    async remove(userId: string, courseId: string): Promise<void> {
      if (!storage) {
        throw new CourseThumbnailConfigurationError();
      }
      const teacherId = await resolveTeacherId(userId);
      const result = await dependencies.repository.removeThumbnail(
        courseId,
        teacherId,
      );
      if (result.kind === "not_found") {
        throw new CourseThumbnailNotFoundError();
      }
      if (result.kind === "not_editable") {
        throw new CourseThumbnailNotEditableError();
      }
      await processPendingCleanupBestEffort();
    },

    processPendingCleanup,
  };
}
