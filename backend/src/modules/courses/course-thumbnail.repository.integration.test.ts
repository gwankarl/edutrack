import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { loadEnvironment } from "../../infrastructure/config/env.js";
import { createDatabase } from "../../infrastructure/database/client.js";
import { createDatabasePool } from "../../infrastructure/database/pool.js";
import { createCourseThumbnailRepository } from "./course-thumbnail.repository.js";

const pool = createDatabasePool(loadEnvironment());
const database = createDatabase(pool);
const repository = createCourseThumbnailRepository(database);
const code = () => randomUUID().replaceAll("-", "").slice(0, 16);
const createdCourseIds: string[] = [];
const createdUserIds: string[] = [];
const createdLevelIds: string[] = [];
const createdSubjectIds: string[] = [];
const cleanupAssetIds: string[] = [];

async function fixture() {
  const suffix = code();
  const user = await pool.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id",
    [
      `thumbnail-${suffix}@example.test`,
      "$argon2id$synthetic-test-hash",
      "Thumbnail Teacher",
    ],
  );
  const userId = user.rows[0]!.id;
  createdUserIds.push(userId);
  const profile = await pool.query<{ id: string }>(
    "INSERT INTO teacher_profiles (user_id, display_name) VALUES ($1, $2) RETURNING id",
    [userId, "Thumbnail Teacher"],
  );
  const teacherId = profile.rows[0]!.id;
  const level = await pool.query<{ id: string }>(
    "INSERT INTO academic_levels (code, name, stage, sort_order) VALUES ($1, $2, 'lower_secondary', $3) RETURNING id",
    [
      `thumbnail-${suffix}`,
      "Synthetic Thumbnail Form",
      20_000 + Math.floor(Math.random() * 5_000),
    ],
  );
  const academicLevelId = level.rows[0]!.id;
  createdLevelIds.push(academicLevelId);
  const subject = await pool.query<{ id: string }>(
    "INSERT INTO subjects (code, name, sort_order) VALUES ($1, $2, $3) RETURNING id",
    [`thumbnail-${suffix}`, "Synthetic Thumbnail Subject", 30_000],
  );
  const subjectId = subject.rows[0]!.id;
  createdSubjectIds.push(subjectId);
  const course = await pool.query<{ id: string }>(
    "INSERT INTO courses (title, academic_level_id, subject_id, teacher_id) VALUES ($1, $2, $3, $4) RETURNING id",
    ["Synthetic thumbnail course", academicLevelId, subjectId, teacherId],
  );
  const courseId = course.rows[0]!.id;
  createdCourseIds.push(courseId);
  return { teacherId, courseId };
}

const image = {
  publicId: "edutrack/course-thumbnails/synthetic",
  assetId: `synthetic-${randomUUID()}`,
  secureUrl: "https://res.cloudinary.com/demo/image/upload/synthetic.webp",
  width: 640,
  height: 360,
  format: "webp" as const,
};

describe("course thumbnail repository", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );
    if (result.rows[0]?.database_name !== "edutrack_test") {
      throw new Error(
        "Course thumbnail integration tests may only write to edutrack_test.",
      );
    }
  });

  afterEach(async () => {
    if (cleanupAssetIds.length) {
      await pool.query(
        "DELETE FROM course_thumbnail_cleanup WHERE asset_id = ANY($1::varchar[])",
        [cleanupAssetIds.splice(0)],
      );
    }
    if (createdCourseIds.length) {
      await pool.query("DELETE FROM courses WHERE id = ANY($1::uuid[])", [
        createdCourseIds.splice(0),
      ]);
    }
    if (createdUserIds.length) {
      await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        createdUserIds.splice(0),
      ]);
    }
    if (createdLevelIds.length) {
      await pool.query(
        "DELETE FROM academic_levels WHERE id = ANY($1::uuid[])",
        [createdLevelIds.splice(0)],
      );
    }
    if (createdSubjectIds.length) {
      await pool.query("DELETE FROM subjects WHERE id = ANY($1::uuid[])", [
        createdSubjectIds.splice(0),
      ]);
    }
  });

  afterAll(async () => pool.end());

  it("persists metadata atomically and queues the replaced Cloudinary asset", async () => {
    const { teacherId, courseId } = await fixture();
    await expect(
      repository.replaceThumbnail(courseId, teacherId, image),
    ).resolves.toEqual({ kind: "updated" });
    const second = {
      ...image,
      publicId: `${image.publicId}-next`,
      assetId: `synthetic-${randomUUID()}`,
    };
    cleanupAssetIds.push(image.assetId);
    await expect(
      repository.replaceThumbnail(courseId, teacherId, second),
    ).resolves.toEqual({ kind: "updated" });

    const stored = await pool.query(
      "SELECT thumbnail_public_id, thumbnail_asset_id, thumbnail_secure_url, thumbnail_width, thumbnail_height, thumbnail_format FROM courses WHERE id = $1",
      [courseId],
    );
    expect(stored.rows[0]).toEqual({
      thumbnail_public_id: second.publicId,
      thumbnail_asset_id: second.assetId,
      thumbnail_secure_url: second.secureUrl,
      thumbnail_width: 640,
      thumbnail_height: 360,
      thumbnail_format: "webp",
    });
    const queued = await pool.query(
      "SELECT public_id, asset_id FROM course_thumbnail_cleanup WHERE asset_id = $1",
      [image.assetId],
    );
    expect(queued.rows).toEqual([
      { public_id: image.publicId, asset_id: image.assetId },
    ]);
  });

  it("hides another teacher's course and rejects non-Draft mutation", async () => {
    const owner = await fixture();
    const stranger = await fixture();
    await expect(
      repository.replaceThumbnail(owner.courseId, stranger.teacherId, image),
    ).resolves.toEqual({ kind: "not_found" });
    await pool.query("UPDATE courses SET status = 'published' WHERE id = $1", [
      owner.courseId,
    ]);
    await expect(
      repository.removeThumbnail(owner.courseId, owner.teacherId),
    ).resolves.toEqual({ kind: "not_editable" });
  });

  it("removes metadata and queues the asset before external deletion", async () => {
    const { teacherId, courseId } = await fixture();
    await repository.replaceThumbnail(courseId, teacherId, image);
    cleanupAssetIds.push(image.assetId);
    await expect(
      repository.removeThumbnail(courseId, teacherId),
    ).resolves.toEqual({ kind: "updated" });
    const course = await pool.query(
      "SELECT thumbnail_public_id, thumbnail_asset_id, thumbnail_secure_url FROM courses WHERE id = $1",
      [courseId],
    );
    expect(course.rows[0]).toEqual({
      thumbnail_public_id: null,
      thumbnail_asset_id: null,
      thumbnail_secure_url: null,
    });
    const queued = await pool.query(
      "SELECT asset_id FROM course_thumbnail_cleanup WHERE asset_id = $1",
      [image.assetId],
    );
    expect(queued.rows).toHaveLength(1);
  });

  it("rejects partial thumbnail metadata and unsupported image formats", async () => {
    const { courseId } = await fixture();
    await expect(
      pool.query(
        "UPDATE courses SET thumbnail_public_id = 'partial' WHERE id = $1",
        [courseId],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        "UPDATE courses SET thumbnail_public_id = $2, thumbnail_asset_id = $3, thumbnail_secure_url = $4, thumbnail_width = 1, thumbnail_height = 1, thumbnail_format = 'gif' WHERE id = $1",
        [
          courseId,
          `asset-${randomUUID()}`,
          `asset-${randomUUID()}`,
          "https://images.example.test/course.gif",
        ],
      ),
    ).rejects.toThrow();
  });
});
