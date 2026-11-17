ALTER TABLE "courses" ADD COLUMN "thumbnail_public_id" varchar(255);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "thumbnail_asset_id" varchar(255);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "thumbnail_secure_url" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "thumbnail_width" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "thumbnail_height" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "thumbnail_format" varchar(8);--> statement-breakpoint
CREATE TABLE "course_thumbnail_cleanup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" varchar(255) NOT NULL,
	"asset_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_thumbnail_cleanup_attempt_count_nonnegative" CHECK ("course_thumbnail_cleanup"."attempt_count" >= 0)
);--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_thumbnail_metadata_complete" CHECK (("courses"."thumbnail_public_id" IS NULL AND "courses"."thumbnail_asset_id" IS NULL AND "courses"."thumbnail_secure_url" IS NULL AND "courses"."thumbnail_width" IS NULL AND "courses"."thumbnail_height" IS NULL AND "courses"."thumbnail_format" IS NULL) OR ("courses"."thumbnail_public_id" IS NOT NULL AND "courses"."thumbnail_asset_id" IS NOT NULL AND "courses"."thumbnail_secure_url" IS NOT NULL AND "courses"."thumbnail_width" IS NOT NULL AND "courses"."thumbnail_height" IS NOT NULL AND "courses"."thumbnail_format" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_thumbnail_secure_url_check" CHECK ("courses"."thumbnail_secure_url" IS NULL OR "courses"."thumbnail_secure_url" LIKE 'https://%');--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_thumbnail_dimensions_positive" CHECK (("courses"."thumbnail_width" IS NULL AND "courses"."thumbnail_height" IS NULL) OR ("courses"."thumbnail_width" > 0 AND "courses"."thumbnail_height" > 0));--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_thumbnail_format_check" CHECK ("courses"."thumbnail_format" IS NULL OR "courses"."thumbnail_format" IN ('jpg', 'png', 'webp'));--> statement-breakpoint
CREATE UNIQUE INDEX "courses_thumbnail_public_id_unique" ON "courses" USING btree ("thumbnail_public_id") WHERE "courses"."thumbnail_public_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "courses_thumbnail_asset_id_unique" ON "courses" USING btree ("thumbnail_asset_id") WHERE "courses"."thumbnail_asset_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "course_thumbnail_cleanup_asset_id_unique" ON "course_thumbnail_cleanup" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "course_thumbnail_cleanup_next_attempt_idx" ON "course_thumbnail_cleanup" USING btree ("next_attempt_at");
