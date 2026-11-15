import { and, count, desc, eq } from "drizzle-orm";

import type {
  CreateTeacherCourseRequest,
  TeacherCourseListQuery,
  TeacherCourseListResponse,
  TeacherCourseResponse,
  UpdateTeacherCourseRequest,
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
  "status" | "page" | "pageSize"
>;

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
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function teacherCourseWhere(
  teacherId: string,
  status: TeacherCourseListFilters["status"],
) {
  if (status) {
    return and(eq(courses.teacherId, teacherId), eq(courses.status, status));
  }

  return eq(courses.teacherId, teacherId);
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
      const where = teacherCourseWhere(teacherId, filters.status);

      const [countResult] = await database
        .select({ totalItems: count() })
        .from(courses)
        .where(where);

      const rows = await selectCourseWithCatalog(database)
        .where(where)
        .orderBy(desc(courses.createdAt), desc(courses.id))
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
