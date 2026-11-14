import { count, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type {
  AdminTeacherApplicationListQuery,
  AdminTeacherApplicationListResponse,
  AdminTeacherApplicationResponse,
} from "@edutrack/contracts";
import {
  adminTeacherApplicationListResponseSchema,
  adminTeacherApplicationResponseSchema,
} from "@edutrack/contracts";
import type { Database } from "../../infrastructure/database/client.js";
import {
  teacherApplications,
  type TeacherApplicationStatus,
} from "../../infrastructure/database/schema/teacher-applications.js";
import { users } from "../../infrastructure/database/schema/users.js";

const applicant = alias(users, "applicant");
const reviewer = alias(users, "reviewer");

const applicationSelection = {
  id: teacherApplications.id,
  status: teacherApplications.status,
  motivation: teacherApplications.motivation,
  qualifications: teacherApplications.qualifications,
  submittedAt: teacherApplications.submittedAt,
  reviewedAt: teacherApplications.reviewedAt,
  reviewedBy: teacherApplications.reviewedBy,
  rejectionReason: teacherApplications.rejectionReason,
  reviewNotes: teacherApplications.reviewNotes,
  applicantId: applicant.id,
  applicantDisplayName: applicant.displayName,
  applicantEmail: applicant.email,
  reviewerId: reviewer.id,
  reviewerDisplayName: reviewer.displayName,
  reviewerEmail: reviewer.email,
};

type JoinedTeacherApplication = {
  id: string;
  status: TeacherApplicationStatus;
  motivation: string;
  qualifications: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  reviewNotes: string | null;
  applicantId: string;
  applicantDisplayName: string;
  applicantEmail: string;
  reviewerId: string | null;
  reviewerDisplayName: string | null;
  reviewerEmail: string | null;
};

function getReviewer(
  application: JoinedTeacherApplication,
): { id: string; displayName: string; email: string } | null {
  if (
    application.reviewerId === null ||
    application.reviewerDisplayName === null ||
    application.reviewerEmail === null
  ) {
    return null;
  }

  return {
    id: application.reviewerId,
    displayName: application.reviewerDisplayName,
    email: application.reviewerEmail,
  };
}

function requireReviewTimestamp(application: JoinedTeacherApplication): string {
  if (application.reviewedAt === null) {
    throw new Error("Reviewed application is missing its review timestamp.");
  }

  return application.reviewedAt.toISOString();
}

function requireReviewer(application: JoinedTeacherApplication): {
  id: string;
  displayName: string;
  email: string;
} {
  const applicationReviewer = getReviewer(application);

  if (applicationReviewer === null) {
    throw new Error("Reviewed application is missing its reviewer record.");
  }

  return applicationReviewer;
}

function toAdminResponse(
  application: JoinedTeacherApplication,
): AdminTeacherApplicationResponse {
  const sharedFields = {
    id: application.id,
    applicant: {
      id: application.applicantId,
      displayName: application.applicantDisplayName,
      email: application.applicantEmail,
    },
    motivation: application.motivation,
    qualifications: application.qualifications,
    submittedAt: application.submittedAt.toISOString(),
  };

  switch (application.status) {
    case "pending":
      return adminTeacherApplicationResponseSchema.parse({
        ...sharedFields,
        status: "pending",
        reviewedAt: null,
        reviewer: null,
        rejectionReason: null,
        reviewNotes: null,
      });

    case "approved":
      return adminTeacherApplicationResponseSchema.parse({
        ...sharedFields,
        status: "approved",
        reviewedAt: requireReviewTimestamp(application),
        reviewer: requireReviewer(application),
        rejectionReason: null,
        reviewNotes: application.reviewNotes,
      });

    case "rejected":
      return adminTeacherApplicationResponseSchema.parse({
        ...sharedFields,
        status: "rejected",
        reviewedAt: requireReviewTimestamp(application),
        reviewer: requireReviewer(application),
        rejectionReason: application.rejectionReason,
        reviewNotes: application.reviewNotes,
      });
  }
}

export function createTeacherApplicationReviewRepository(database: Database) {
  return {
    async listApplications(
      query: AdminTeacherApplicationListQuery,
    ): Promise<AdminTeacherApplicationListResponse> {
      const statusFilter = query.status
        ? eq(teacherApplications.status, query.status)
        : undefined;
      const offset = (query.page - 1) * query.pageSize;

      const [[countRow], rows] = await Promise.all([
        database
          .select({ totalItems: count() })
          .from(teacherApplications)
          .where(statusFilter),
        database
          .select(applicationSelection)
          .from(teacherApplications)
          .innerJoin(applicant, eq(teacherApplications.userId, applicant.id))
          .leftJoin(reviewer, eq(teacherApplications.reviewedBy, reviewer.id))
          .where(statusFilter)
          .orderBy(
            desc(teacherApplications.submittedAt),
            desc(teacherApplications.id),
          )
          .limit(query.pageSize)
          .offset(offset),
      ]);

      const totalItems = countRow?.totalItems ?? 0;
      const items = rows.map((row) =>
        toAdminResponse(row as JoinedTeacherApplication),
      );

      return adminTeacherApplicationListResponseSchema.parse({
        items,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / query.pageSize),
        },
      });
    },

    async findById(
      applicationId: string,
    ): Promise<AdminTeacherApplicationResponse | null> {
      const [application] = await database
        .select(applicationSelection)
        .from(teacherApplications)
        .innerJoin(applicant, eq(teacherApplications.userId, applicant.id))
        .leftJoin(reviewer, eq(teacherApplications.reviewedBy, reviewer.id))
        .where(eq(teacherApplications.id, applicationId))
        .limit(1);

      return application
        ? toAdminResponse(application as JoinedTeacherApplication)
        : null;
    },
  };
}
