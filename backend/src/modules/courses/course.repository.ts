import { and, asc, count, desc, eq, ilike } from "drizzle-orm";

import type {
  CreateTeacherCourseRequest,
  TeacherCourseListQuery,
  TeacherCourseListResponse,
  TeacherCourseResponse,
  UpdateTeacherCourseRequest,
  CourseStatus,
  TeacherDashboardSummaryResponse,
} from "@edutrack/contracts";
import type { Database } from "../../infrastructure/database/client.js";
import { academicLevels } from "../../infrastructure/database/schema/academic-levels.js";
import { courses } from "../../infrastructure/database/schema/courses.js";
import { subjects } from "../../infrastructure/database/schema/subjects.js";

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type DatabaseExecutor = Database | DatabaseTransaction;

export type CreateCourseData = CreateTeacherCourseRequest & {
  /**
   * The authenticated teacher profile ID, resolved by the backend.
   * Never take this value from the request body.
   */
  teacherId: string;
};

export type TeacherCourseListFilters = Pick<
  TeacherCourseListQuery,
  "status" | "search" | "page" | "pageSize"
> & {
  sort?: TeacherCourseListQuery["sort"];
};

export type UpdateTeacherCourseResult =
  | { kind: "updated"; course: TeacherCourseResponse }
  | { kind: "not_found" }
  | { kind: "not_editable" };

function selectCourseWithCatalog(database: DatabaseExecutor) {
  return database
    .select({
      id: courses.id,
      title: courses.title,
      description: courses.description,
      academicLevel: {
        id: academicLevels.id,
        code: academicLevels.code,
        name: academicLevels.name,
        educationStage: academicLevels.stage,
        sortOrder: academicLevels.sortOrder,
      },
      subject: {
        id: subjects.id,
        code: subjects.code,
        name: subjects.name,
        sortOrder: subjects.sortOrder,
      },
      status: courses.status,
      thumbnailPublicId: courses.thumbnailPublicId,
      thumbnailAssetId: courses.thumbnailAssetId,
      thumbnailSecureUrl: courses.thumbnailSecureUrl,
      thumbnailWidth: courses.thumbnailWidth,
      thumbnailHeight: courses.thumbnailHeight,
      thumbnailFormat: courses.thumbnailFormat,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
    })
    .from(courses)
    .innerJoin(academicLevels, eq(courses.academicLevelId, academicLevels.id))
    .innerJoin(subjects, eq(courses.subjectId, subjects.id));
}

type JoinedCourse = Awaited<ReturnType<typeof selectCourseWithCatalog>>[number];

function toTeacherCourseResponse(row: JoinedCourse): TeacherCourseResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    academicLevel: row.academicLevel,
    subject: row.subject,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    thumbnail:
      row.thumbnailSecureUrl &&
      row.thumbnailWidth &&
      row.thumbnailHeight &&
      row.thumbnailFormat
        ? {
            url: row.thumbnailSecureUrl,
            width: row.thumbnailWidth,
            height: row.thumbnailHeight,
            format: row.thumbnailFormat as "jpg" | "png" | "webp",
          }
        : null,
  };
}

function teacherCourseWhere(
  teacherId: string,
  filters: Pick<TeacherCourseListFilters, "status" | "search">,
) {
  const conditions = [eq(courses.teacherId, teacherId)];

  if (filters.status) {
    conditions.push(eq(courses.status, filters.status));
  }

  if (filters.search) {
    const escapedSearch = filters.search.replace(/[\\%_]/g, "\\$&");
    conditions.push(ilike(courses.title, `%${escapedSearch}%`));
  }

  return and(...conditions);
}

function teacherCourseOrder(sort: TeacherCourseListQuery["sort"]) {
  switch (sort) {
    case "created_desc":
      return [desc(courses.createdAt), desc(courses.id)] as const;
    case "title_asc":
      return [asc(courses.title), asc(courses.id)] as const;
    case "title_desc":
      return [desc(courses.title), desc(courses.id)] as const;
    case "updated_desc":
    default:
      return [desc(courses.updatedAt), desc(courses.id)] as const;
  }
}

/**
 * Creates course repository operations against a database or an active
 * transaction. The caller owns transaction boundaries and business rules.
 */
export function createCourseRepository(database: DatabaseExecutor) {
  return {
    async createCourse(data: CreateCourseData): Promise<TeacherCourseResponse> {
      const [created] = await database
        .insert(courses)
        .values({
          title: data.title,
          description: data.description,
          academicLevelId: data.academicLevelId,
          subjectId: data.subjectId,
          teacherId: data.teacherId,
          status: "draft",
        })
        .returning({ id: courses.id });

      if (!created) {
        throw new Error("Course insert did not return a row.");
      }

      const [course] = await selectCourseWithCatalog(database)
        .where(
          and(
            eq(courses.id, created.id),
            eq(courses.teacherId, data.teacherId),
          ),
        )
        .limit(1);

      if (!course) {
        throw new Error("Created course could not be retrieved.");
      }

      return toTeacherCourseResponse(course);
    },

    async listTeacherCourses(
      teacherId: string,
      filters: TeacherCourseListFilters,
    ): Promise<TeacherCourseListResponse> {
      const where = teacherCourseWhere(teacherId, filters);
      const order = teacherCourseOrder(filters.sort ?? "updated_desc");

      const [countResult] = await database
        .select({ totalItems: count() })
        .from(courses)
        .where(where);

      const rows = await selectCourseWithCatalog(database)
        .where(where)
        .orderBy(...order)
        .limit(filters.pageSize)
        .offset((filters.page - 1) * filters.pageSize);

      const totalItems = countResult?.totalItems ?? 0;

      return {
        items: rows.map(toTeacherCourseResponse),
        pagination: {
          page: filters.page,
          pageSize: filters.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / filters.pageSize),
        },
      };
    },

    async getTeacherDashboardSummary(
      teacherId: string,
    ): Promise<TeacherDashboardSummaryResponse> {
      const [statusRows, recentDraftRows] = await Promise.all([
        database
          .select({
            status: courses.status,
            courseCount: count(),
          })
          .from(courses)
          .where(eq(courses.teacherId, teacherId))
          .groupBy(courses.status),
        database
          .select({
            id: courses.id,
            title: courses.title,
            updatedAt: courses.updatedAt,
          })
          .from(courses)
          .where(
            and(eq(courses.teacherId, teacherId), eq(courses.status, "draft")),
          )
          .orderBy(desc(courses.updatedAt), desc(courses.id))
          .limit(3),
      ]);

      const counts: Record<CourseStatus, number> = {
        draft: 0,
        pending_review: 0,
        published: 0,
        rejected: 0,
      };

      for (const row of statusRows) {
        counts[row.status] = row.courseCount;
      }

      return {
        statusCounts: {
          total: Object.values(counts).reduce(
            (sum, courseCount) => sum + courseCount,
            0,
          ),
          draft: counts.draft,
          pendingReview: counts.pending_review,
          published: counts.published,
          rejected: counts.rejected,
        },
        recentDraftCourses: recentDraftRows.map((course) => ({
          ...course,
          status: "draft",
          updatedAt: course.updatedAt.toISOString(),
        })),
      };
    },

    async getTeacherCourseById(
      courseId: string,
      teacherId: string,
    ): Promise<TeacherCourseResponse | null> {
      const [course] = await selectCourseWithCatalog(database)
        .where(and(eq(courses.id, courseId), eq(courses.teacherId, teacherId)))
        .limit(1);

      return course ? toTeacherCourseResponse(course) : null;
    },

    async updateTeacherCourse(
      courseId: string,
      teacherId: string,
      data: UpdateTeacherCourseRequest,
    ): Promise<UpdateTeacherCourseResult> {
      const [updated] = await database
        .update(courses)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(courses.id, courseId),
            eq(courses.teacherId, teacherId),
            eq(courses.status, "draft"),
          ),
        )
        .returning({ id: courses.id });

      if (!updated) {
        // A course owned by another teacher is indistinguishable from a
        // missing course. Only inspect editability after confirming ownership.
        const [ownedCourse] = await database
          .select({ id: courses.id })
          .from(courses)
          .where(
            and(eq(courses.id, courseId), eq(courses.teacherId, teacherId)),
          )
          .limit(1);

        return ownedCourse ? { kind: "not_editable" } : { kind: "not_found" };
      }

      const [course] = await selectCourseWithCatalog(database)
        .where(
          and(eq(courses.id, updated.id), eq(courses.teacherId, teacherId)),
        )
        .limit(1);

      if (!course) {
        return { kind: "not_found" };
      }

      return {
        kind: "updated",
        course: toTeacherCourseResponse(course),
      };
    },
  };
}
