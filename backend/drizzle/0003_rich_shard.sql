CREATE TYPE "public"."academic_level_stage" AS ENUM('lower_secondary', 'upper_secondary');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('draft', 'pending_review', 'published', 'rejected');--> statement-breakpoint
CREATE TABLE "academic_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(100) NOT NULL,
	"stage" "academic_level_stage" NOT NULL,
	"sort_order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_levels_code_check" CHECK ("academic_levels"."code" = lower("academic_levels"."code") AND length(btrim("academic_levels"."code")) > 0),
	CONSTRAINT "academic_levels_name_not_blank" CHECK (length(btrim("academic_levels"."name")) > 0),
	CONSTRAINT "academic_levels_sort_order_positive" CHECK ("academic_levels"."sort_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"academic_level_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"status" "course_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_title_not_blank" CHECK (length(btrim("courses"."title")) > 0),
	CONSTRAINT "courses_description_not_blank" CHECK ("courses"."description" IS NULL OR length(btrim("courses"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"content" jsonb,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_title_not_blank" CHECK (length(btrim("lessons"."title")) > 0),
	CONSTRAINT "lessons_position_positive" CHECK ("lessons"."position" > 0),
	CONSTRAINT "lessons_content_object_check" CHECK ("lessons"."content" IS NULL OR jsonb_typeof("lessons"."content") = 'object')
);
--> statement-breakpoint
CREATE TABLE "quiz_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"option_text" text NOT NULL,
	"position" integer NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	CONSTRAINT "quiz_options_option_text_not_blank" CHECK (length(btrim("quiz_options"."option_text")) > 0),
	CONSTRAINT "quiz_options_position_positive" CHECK ("quiz_options"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_questions_question_text_not_blank" CHECK (length(btrim("quiz_questions"."question_text")) > 0),
	CONSTRAINT "quiz_questions_position_positive" CHECK ("quiz_questions"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_title_not_blank" CHECK (length(btrim("quizzes"."title")) > 0),
	CONSTRAINT "quizzes_description_not_blank" CHECK ("quizzes"."description" IS NULL OR length(btrim("quizzes"."description")) > 0),
	CONSTRAINT "quizzes_position_positive" CHECK ("quizzes"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(100) NOT NULL,
	"sort_order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_code_check" CHECK ("subjects"."code" = lower("subjects"."code") AND length(btrim("subjects"."code")) > 0),
	CONSTRAINT "subjects_name_not_blank" CHECK (length(btrim("subjects"."name")) > 0),
	CONSTRAINT "subjects_sort_order_positive" CHECK ("subjects"."sort_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_title_not_blank" CHECK (length(btrim("topics"."title")) > 0),
	CONSTRAINT "topics_description_not_blank" CHECK ("topics"."description" IS NULL OR length(btrim("topics"."description")) > 0),
	CONSTRAINT "topics_position_positive" CHECK ("topics"."position" > 0)
);
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_academic_level_id_academic_levels_id_fk" FOREIGN KEY ("academic_level_id") REFERENCES "public"."academic_levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacher_id_teacher_profiles_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_options" ADD CONSTRAINT "quiz_options_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_levels_code_unique" ON "academic_levels" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_levels_sort_order_unique" ON "academic_levels" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "academic_levels_stage_idx" ON "academic_levels" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "courses_academic_level_subject_idx" ON "courses" USING btree ("academic_level_id","subject_id");--> statement-breakpoint
CREATE INDEX "courses_subject_id_idx" ON "courses" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "courses_teacher_id_idx" ON "courses" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "courses_status_created_at_idx" ON "courses" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_topic_position_unique" ON "lessons" USING btree ("topic_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_options_question_position_unique" ON "quiz_options" USING btree ("question_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_options_one_correct_per_question_unique" ON "quiz_options" USING btree ("question_id") WHERE "quiz_options"."is_correct" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_questions_quiz_position_unique" ON "quiz_questions" USING btree ("quiz_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_topic_position_unique" ON "quizzes" USING btree ("topic_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_code_unique" ON "subjects" USING btree ("code");--> statement-breakpoint
CREATE INDEX "subjects_sort_order_idx" ON "subjects" USING btree ("sort_order","code");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_course_position_unique" ON "topics" USING btree ("course_id","position");