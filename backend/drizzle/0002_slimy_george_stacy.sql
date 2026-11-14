ALTER TABLE "teacher_applications" DROP CONSTRAINT "teacher_applications_review_state_check";--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
UPDATE "teacher_applications"
SET "rejection_reason" = "review_notes"
WHERE "status" = 'rejected';--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_review_state_check" CHECK ((
        "teacher_applications"."status" = 'pending'
        AND "teacher_applications"."reviewed_at" IS NULL
        AND "teacher_applications"."reviewed_by" IS NULL
        AND "teacher_applications"."rejection_reason" IS NULL
        AND "teacher_applications"."review_notes" IS NULL
      ) OR (
        "teacher_applications"."status" = 'approved'
        AND "teacher_applications"."reviewed_at" IS NOT NULL
        AND "teacher_applications"."reviewed_by" IS NOT NULL
        AND "teacher_applications"."rejection_reason" IS NULL
      ) OR (
        "teacher_applications"."status" = 'rejected'
        AND "teacher_applications"."reviewed_at" IS NOT NULL
        AND "teacher_applications"."reviewed_by" IS NOT NULL
        AND "teacher_applications"."rejection_reason" IS NOT NULL
        AND length(btrim("teacher_applications"."rejection_reason")) > 0
      ));
