CREATE TYPE "public"."teacher_application_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "teacher_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "teacher_application_status" DEFAULT 'pending' NOT NULL,
	"motivation" text NOT NULL,
	"qualifications" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_notes" text,
	CONSTRAINT "teacher_applications_motivation_not_blank" CHECK (length(btrim("teacher_applications"."motivation")) > 0),
	CONSTRAINT "teacher_applications_qualifications_not_blank" CHECK (length(btrim("teacher_applications"."qualifications")) > 0),
	CONSTRAINT "teacher_applications_review_state_check" CHECK ((
        "teacher_applications"."status" = 'pending'
        AND "teacher_applications"."reviewed_at" IS NULL
        AND "teacher_applications"."reviewed_by" IS NULL
        AND "teacher_applications"."review_notes" IS NULL
      ) OR (
        "teacher_applications"."status" = 'approved'
        AND "teacher_applications"."reviewed_at" IS NOT NULL
        AND "teacher_applications"."reviewed_by" IS NOT NULL
      ) OR (
        "teacher_applications"."status" = 'rejected'
        AND "teacher_applications"."reviewed_at" IS NOT NULL
        AND "teacher_applications"."reviewed_by" IS NOT NULL
        AND "teacher_applications"."review_notes" IS NOT NULL
        AND length(btrim("teacher_applications"."review_notes")) > 0
      ))
);
--> statement-breakpoint
CREATE TABLE "teacher_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"biography" text,
	"qualifications" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_profiles_display_name_not_blank" CHECK (length(btrim("teacher_profiles"."display_name")) > 0),
	CONSTRAINT "teacher_profiles_biography_not_blank" CHECK ("teacher_profiles"."biography" IS NULL OR length(btrim("teacher_profiles"."biography")) > 0),
	CONSTRAINT "teacher_profiles_qualifications_not_blank" CHECK ("teacher_profiles"."qualifications" IS NULL OR length(btrim("teacher_profiles"."qualifications")) > 0)
);
--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_applications" ADD CONSTRAINT "teacher_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teacher_applications_user_id_idx" ON "teacher_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teacher_applications_status_submitted_at_idx" ON "teacher_applications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_applications_one_pending_per_user_unique" ON "teacher_applications" USING btree ("user_id") WHERE "teacher_applications"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_profiles_user_id_unique" ON "teacher_profiles" USING btree ("user_id");