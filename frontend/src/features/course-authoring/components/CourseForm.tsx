import {
  COURSE_DESCRIPTION_MAX_LENGTH,
  COURSE_TITLE_MAX_LENGTH,
  createTeacherCourseRequestSchema,
  updateTeacherCourseRequestSchema,
  type CourseThumbnailResponse,
  type AcademicLevelResponse,
  type CreateTeacherCourseRequest,
  type SubjectResponse,
  type TeacherCourseResponse,
} from "@edutrack/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  BookOpen,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useAcademicCatalog } from "../../catalog/hooks/useAcademicCatalog.js";
import { useCreateCourse } from "../hooks/useCreateCourse.js";
import { useUpdateCourse } from "../hooks/useUpdateCourse.js";
import CourseThumbnailField, {
  type CourseThumbnailSelection,
} from "./CourseThumbnailField.js";
import {
  useRemoveCourseThumbnail,
  useUploadCourseThumbnail,
} from "../hooks/useCourseThumbnail.js";

const courseFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Enter a course title.")
      .max(COURSE_TITLE_MAX_LENGTH, "The title is too long."),
    description: z
      .string()
      .max(
        COURSE_DESCRIPTION_MAX_LENGTH,
        `Description must be ${COURSE_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      ),
    academicLevelId: z.string().uuid("Choose an academic level."),
    subjectId: z.string().uuid("Choose a subject."),
  })
  .transform(({ description, ...values }) => ({
    ...values,
    ...(description.trim() ? { description: description.trim() } : {}),
  }))
  .pipe(createTeacherCourseRequestSchema);

type CourseFormInput = z.input<typeof courseFormSchema>;
type CourseFormOutput = CreateTeacherCourseRequest;

interface CourseFormProps {
  initialCourse?: TeacherCourseResponse;
  onCreated?: (course: TeacherCourseResponse) => void;
  onUpdated?: (course: TeacherCourseResponse) => void;
}

interface PendingThumbnailOperation {
  kind: "create" | "edit";
  course: TeacherCourseResponse;
  file: File | null;
}

const fieldClassName =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60";

function safeCourseErrorMessage(error: unknown, editing: boolean): string {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;

    if (status === 401) {
      return "Your session has expired. Sign in again before creating a course.";
    }
    if (status === 403) {
      return "An active Teacher account is required to create a course.";
    }
    if (status === 409) {
      return editing
        ? "This course is no longer a draft and cannot be edited. Refresh to see its current details."
        : "We couldn't create the course with these catalog choices. Refresh and try again.";
    }
    if (status === 400) {
      return "Please check the course details and try again.";
    }
  }

  return editing
    ? "We couldn't save your course changes. Please try again."
    : "We couldn't create your course. Please try again.";
}

function safeThumbnailErrorMessage(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : null;

  if (status === 401) return "Your session expired. Sign in and try again.";
  if (status === 403) {
    return "You no longer have permission to change this image.";
  }
  if (status === 404) return "This course is no longer available.";
  if (status === 409) {
    return "This course is no longer a draft. Refresh its details.";
  }
  if (status === 413) return "The image must be 5 MB or smaller.";
  if (status === 400) return "Choose a valid JPEG, PNG, or WebP image.";

  return "The image change could not be completed. Your course is saved; try the image operation again.";
}

function CatalogError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      aria-live="polite"
      className="space-y-2 rounded-md border border-danger bg-surface p-4 text-sm text-danger"
      role="alert"
    >
      <p>We couldn't load the academic levels and subjects.</p>
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        Try again
      </button>
    </div>
  );
}

function AcademicLevelOptions({ levels }: { levels: AcademicLevelResponse[] }) {
  return (
    <>
      <option value="">Choose an academic level</option>
      {levels.map((level) => (
        <option key={level.id} value={level.id}>
          {level.name}
        </option>
      ))}
    </>
  );
}

function SubjectOptions({ subjects }: { subjects: SubjectResponse[] }) {
  return (
    <>
      <option value="">Choose a subject</option>
      {subjects.map((subject) => (
        <option key={subject.id} value={subject.id}>
          {subject.name}
        </option>
      ))}
    </>
  );
}

export default function CourseForm({
  initialCourse,
  onCreated,
  onUpdated,
}: CourseFormProps) {
  const catalog = useAcademicCatalog();
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const uploadThumbnail = useUploadCourseThumbnail();
  const removeThumbnail = useRemoveCourseThumbnail();
  const [thumbnailSelection, setThumbnailSelection] =
    useState<CourseThumbnailSelection>({
      file: null,
      removeExisting: false,
    });
  const [pendingThumbnailOperation, setPendingThumbnailOperation] =
    useState<PendingThumbnailOperation | null>(null);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const isEditing = initialCourse !== undefined;
  const initializedCourseId = useRef<string | null>(null);
  const levels = catalog.data?.academicLevels ?? [];
  const subjects = catalog.data?.subjects ?? [];
  const catalogEmpty =
    !catalog.isPending &&
    !catalog.isError &&
    (!levels.length || !subjects.length);
  const catalogUnavailable =
    catalog.isPending || catalog.isError || catalogEmpty;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CourseFormInput, unknown, CourseFormOutput>({
    resolver: zodResolver(courseFormSchema),
    mode: "onBlur",
    defaultValues: {
      title: "",
      description: "",
      academicLevelId: "",
      subjectId: "",
    },
  });

  useEffect(() => {
    if (
      initialCourse &&
      catalog.data &&
      initializedCourseId.current !== initialCourse.id
    ) {
      reset({
        title: initialCourse.title,
        description: initialCourse.description ?? "",
        academicLevelId: initialCourse.academicLevel.id,
        subjectId: initialCourse.subject.id,
      });
      initializedCourseId.current = initialCourse.id;
    }
  }, [catalog.data, initialCourse, reset]);

  const mutation = isEditing ? updateCourse : createCourse;
  const isEditable = !initialCourse || initialCourse.status === "draft";
  const isUploading = uploadThumbnail.isPending || removeThumbnail.isPending;
  const isBusy =
    isSubmitting ||
    mutation.isPending ||
    isUploading ||
    pendingThumbnailOperation !== null;

  async function completeThumbnailOperation(
    operation: PendingThumbnailOperation,
  ) {
    setThumbnailError(null);

    try {
      let thumbnail: CourseThumbnailResponse | null;

      if (operation.file) {
        thumbnail = await uploadThumbnail.mutateAsync({
          courseId: operation.course.id,
          file: operation.file,
        });
      } else {
        await removeThumbnail.mutateAsync({ courseId: operation.course.id });
        thumbnail = null;
      }

      const completedCourse = { ...operation.course, thumbnail };
      setPendingThumbnailOperation(null);
      setThumbnailSelection({ file: null, removeExisting: false });

      if (operation.kind === "create") {
        onCreated?.(completedCourse);
      } else {
        onUpdated?.(completedCourse);
      }
    } catch (error) {
      setThumbnailError(safeThumbnailErrorMessage(error));
    }
  }

  async function submitCourse(values: CourseFormOutput) {
    if (!isEditable || pendingThumbnailOperation) return;

    createCourse.reset();
    updateCourse.reset();
    uploadThumbnail.reset();
    removeThumbnail.reset();
    setThumbnailError(null);

    if (initialCourse) {
      let savedCourse: TeacherCourseResponse;

      try {
        const input = updateTeacherCourseRequestSchema.parse({
          ...values,
          description: values.description ?? null,
        });
        savedCourse = await updateCourse.mutateAsync({
          courseId: initialCourse.id,
          input,
        });
      } catch {
        return;
      }

      if (thumbnailSelection.file || thumbnailSelection.removeExisting) {
        const operation: PendingThumbnailOperation = {
          kind: "edit",
          course: savedCourse,
          file: thumbnailSelection.file,
        };
        setPendingThumbnailOperation(operation);
        await completeThumbnailOperation(operation);
      } else {
        onUpdated?.(savedCourse);
      }
      return;
    }

    let createdCourse: TeacherCourseResponse;

    try {
      const input = createTeacherCourseRequestSchema.parse(values);
      createdCourse = await createCourse.mutateAsync(input);
    } catch {
      return;
    }

    if (thumbnailSelection.file) {
      const operation: PendingThumbnailOperation = {
        kind: "create",
        course: createdCourse,
        file: thumbnailSelection.file,
      };
      setPendingThumbnailOperation(operation);
      await completeThumbnailOperation(operation);
      return;
    }

    onCreated?.(createdCourse);
  }

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={handleSubmit(submitCourse)}
    >
      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="course-title"
        >
          Course title{" "}
          <span aria-hidden="true" className="text-danger">
            *
          </span>
        </label>
        <input
          {...register("title")}
          aria-describedby={errors.title ? "course-title-error" : undefined}
          aria-invalid={Boolean(errors.title)}
          autoComplete="off"
          className={fieldClassName}
          disabled={catalogUnavailable || isBusy || !isEditable}
          id="course-title"
          maxLength={COURSE_TITLE_MAX_LENGTH}
          required
        />
        {errors.title?.message && (
          <p
            className="text-sm text-danger"
            id="course-title-error"
            role="alert"
          >
            {errors.title.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-foreground"
          htmlFor="course-description"
        >
          Description{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          {...register("description")}
          aria-describedby={
            errors.description
              ? "course-description-help course-description-error"
              : "course-description-help"
          }
          aria-invalid={Boolean(errors.description)}
          className={`${fieldClassName} min-h-32 resize-y`}
          disabled={catalogUnavailable || isBusy || !isEditable}
          id="course-description"
          maxLength={COURSE_DESCRIPTION_MAX_LENGTH}
          rows={5}
        />
        <p
          className="text-sm text-muted-foreground"
          id="course-description-help"
        >
          Add a short overview for students. Maximum{" "}
          {COURSE_DESCRIPTION_MAX_LENGTH} characters.
        </p>
        {errors.description?.message && (
          <p
            className="text-sm text-danger"
            id="course-description-error"
            role="alert"
          >
            {errors.description.message}
          </p>
        )}
      </div>

      {catalog.isPending && (
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin text-primary"
          />
          Loading academic levels and subjects…
        </p>
      )}
      {catalog.isError && (
        <CatalogError onRetry={() => void catalog.refetch()} />
      )}
      {catalogEmpty && (
        <p
          className="rounded-md border border-border bg-surface p-4 text-sm text-muted-foreground"
          role="status"
        >
          No academic levels or subjects are available yet. Please try again
          later.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="course-academic-level"
          >
            Academic level{" "}
            <span aria-hidden="true" className="text-danger">
              *
            </span>
          </label>
          <select
            {...register("academicLevelId")}
            aria-describedby={
              errors.academicLevelId ? "course-academic-level-error" : undefined
            }
            aria-invalid={Boolean(errors.academicLevelId)}
            className={fieldClassName}
            disabled={catalogUnavailable || isBusy || !isEditable}
            id="course-academic-level"
            required
          >
            <AcademicLevelOptions levels={levels} />
          </select>
          {errors.academicLevelId?.message && (
            <p
              className="text-sm text-danger"
              id="course-academic-level-error"
              role="alert"
            >
              {errors.academicLevelId.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="course-subject"
          >
            Subject{" "}
            <span aria-hidden="true" className="text-danger">
              *
            </span>
          </label>
          <select
            {...register("subjectId")}
            aria-describedby={
              errors.subjectId ? "course-subject-error" : undefined
            }
            aria-invalid={Boolean(errors.subjectId)}
            className={fieldClassName}
            disabled={catalogUnavailable || isBusy || !isEditable}
            id="course-subject"
            required
          >
            <SubjectOptions subjects={subjects} />
          </select>
          {errors.subjectId?.message && (
            <p
              className="text-sm text-danger"
              id="course-subject-error"
              role="alert"
            >
              {errors.subjectId.message}
            </p>
          )}
        </div>
      </div>

      <CourseThumbnailField
        currentThumbnail={initialCourse?.thumbnail}
        disabled={isBusy || !isEditable}
        onChange={setThumbnailSelection}
      />

      {!isEditable && (
        <p
          className="rounded-md border border-border bg-surface p-4 text-sm text-muted-foreground"
          role="status"
        >
          Only Draft courses can be edited.
        </p>
      )}

      {isUploading && (
        <p
          aria-live="polite"
          className="text-sm text-muted-foreground"
          role="status"
        >
          {pendingThumbnailOperation?.file
            ? "Uploading course image…"
            : "Removing course image…"}
        </p>
      )}

      {thumbnailError && (
        <div aria-live="polite" className="space-y-3" role="alert">
          <p className="text-sm text-danger">{thumbnailError}</p>
          {pendingThumbnailOperation && (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isUploading}
              onClick={() => void completeThumbnailOperation(pendingThumbnailOperation)}
              type="button"
            >
              Retry image operation
            </button>
          )}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-md border border-border bg-info-surface p-4 text-sm leading-6 text-foreground">
        <BookOpen
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-primary"
        />
        New courses are saved as drafts. You can add learning materials and
        submit a draft for review later.
      </p>

      <button
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-semibold text-inverse hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={isBusy || catalogUnavailable || !isEditable}
        type="submit"
      >
        {isBusy && (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        )}
        {isBusy
          ? isUploading
            ? "Saving course image…"
            : pendingThumbnailOperation
              ? "Image retry required"
              : isEditing
              ? "Saving changes…"
              : "Creating course…"
          : isEditing
            ? "Save changes"
            : "Create course"}
      </button>

      {mutation.isError && (
        <p
          aria-live="polite"
          className="flex items-start gap-2 text-sm text-danger"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {safeCourseErrorMessage(mutation.error, isEditing)}
        </p>
      )}
      {mutation.isSuccess && !thumbnailError && !pendingThumbnailOperation && (
        <p aria-live="polite" className="text-sm text-success" role="status">
          {isEditing
            ? "Course changes saved."
            : "Course created. Opening its details…"}
        </p>
      )}
    </form>
  );
}
