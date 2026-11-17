import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, Plus } from "lucide-react";
import {
  Link,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  QUIZ_DESCRIPTION_MAX_LENGTH,
  QUIZ_TITLE_MAX_LENGTH,
  createTeacherQuizQuestionRequestSchema,
  createTeacherQuizRequestSchema,
  teacherTopicQuizCollectionParamsSchema,
  teacherTopicQuizParamsSchema,
  updateTeacherQuizRequestSchema,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import { currentUserQueryKey } from "../../auth/hooks/auth-query-keys.js";
import { useTeacherCourse } from "../hooks/useTeacherCourse.js";
import { useTopic } from "../hooks/useTopic.js";
import {
  useCreateTeacherQuiz,
  useCreateTeacherQuizQuestion,
  useReorderTeacherQuizQuestions,
  useTeacherQuiz,
  useTeacherQuizQuestions,
  useUpdateTeacherQuiz,
} from "../hooks/useQuizAuthoring.js";
import QuizQuestionEditor from "../components/QuizQuestionEditor.js";

const quizInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a quiz title.")
    .max(QUIZ_TITLE_MAX_LENGTH),
  description: z.string().max(QUIZ_DESCRIPTION_MAX_LENGTH),
});

const fieldClass =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60";

function Notice({
  title,
  children,
  error = false,
}: {
  title: string;
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <section
      className={`space-y-2 rounded-lg border bg-surface p-5 ${error ? "border-danger" : "border-border"}`}
      role={error ? "alert" : "status"}
    >
      <h2 className="font-semibold text-foreground">{title}</h2>
      <div className="text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session expired. Sign in again and retry.";
    if (error.status === 403)
      return "An active Teacher account is required to manage this quiz.";
    if (error.status === 404)
      return "The course, topic, or quiz could not be found.";
    if (error.status === 409)
      return "This course is no longer a draft or its content changed. Refresh and try again.";
    if (error.status === 400) return "Check the quiz details and try again.";
  }
  return fallback;
}

export default function QuizEditorPage() {
  const {
    courseId: routeCourseId,
    topicId: routeTopicId,
    quizId: routeQuizId,
  } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isCreating = routeQuizId === "new" || pathname.endsWith("/quizzes/new");
  const parsedParent = teacherTopicQuizCollectionParamsSchema.safeParse({
    courseId: routeCourseId,
    topicId: routeTopicId,
  });
  const parsedQuiz = isCreating
    ? null
    : teacherTopicQuizParamsSchema.safeParse({
        courseId: routeCourseId,
        topicId: routeTopicId,
        quizId: routeQuizId,
      });

  const validCourseId = parsedParent.success
    ? parsedParent.data.courseId
    : null;
  const validTopicId = parsedParent.success ? parsedParent.data.topicId : null;
  const courseQuery = useTeacherCourse(validCourseId);
  const topicQuery = useTopic(validCourseId, validTopicId);
  const course = courseQuery.data;
  const topic = topicQuery.data;
  const quizQuery = useTeacherQuiz(
    validCourseId,
    validTopicId,
    !isCreating && parsedQuiz?.success ? parsedQuiz.data.quizId : null,
  );
  const quiz = isCreating ? undefined : quizQuery.data;
  const questionsQuery = useTeacherQuizQuestions(
    validCourseId,
    validTopicId,
    quiz?.id ?? null,
  );

  const createQuiz = useCreateTeacherQuiz(validCourseId, validTopicId);
  const updateQuiz = useUpdateTeacherQuiz(
    validCourseId,
    validTopicId,
    quiz?.id ?? null,
  );
  const createQuestion = useCreateTeacherQuizQuestion(
    validCourseId,
    validTopicId,
    quiz?.id ?? null,
  );
  const reorderQuestions = useReorderTeacherQuizQuestions(
    validCourseId,
    validTopicId,
    quiz?.id ?? null,
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newQuestionText, setNewQuestionText] = useState("");
  const [dirtyParts, setDirtyParts] = useState<Set<string>>(() => new Set());
  const [savedNewQuiz, setSavedNewQuiz] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const allowSavedNavigation = useRef(false);

  useEffect(() => {
    if (!quiz) return;
    setTitle(quiz.title);
    setDescription(quiz.description ?? "");
  }, [quiz?.id, quiz?.updatedAt]);

  const quizDirty = quiz
    ? title.trim() !== quiz.title ||
      description.trim() !== (quiz.description ?? "")
    : !savedNewQuiz &&
      (title.trim().length > 0 || description.trim().length > 0);
  const hasUnsavedChanges =
    quizDirty || newQuestionText.trim().length > 0 || dirtyParts.size > 0;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges &&
      !allowSavedNavigation.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    allowSavedNavigation.current = false;
  }, [pathname]);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const leave = window.confirm(
      "You have unsaved quiz changes. Leave and discard them?",
    );
    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  const setPartDirty = useCallback((key: string, dirty: boolean) => {
    setDirtyParts((current) => {
      if (current.has(key) === dirty) return current;

      const next = new Set(current);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const canEdit = course?.status === "draft";
  const encodedCourseId = encodeURIComponent(validCourseId ?? "");
  const encodedTopicId = encodeURIComponent(validTopicId ?? "");
  const returnToContent = `/teacher/courses/${encodedCourseId}?tab=content&expandedTopicId=${encodedTopicId}`;
  const quizzesPath = `/teacher/courses/${encodedCourseId}/topics/${encodedTopicId}/quizzes`;

  async function saveQuiz(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    const values = quizInputSchema.safeParse({ title, description });
    if (!values.success) {
      setFormError(
        values.error.issues[0]?.message ?? "Check the quiz details.",
      );
      return;
    }

    if (!canEdit) return;

    try {
      if (isCreating) {
        const input = createTeacherQuizRequestSchema.parse({
          title: values.data.title,
          ...(values.data.description.trim()
            ? { description: values.data.description.trim() }
            : {}),
        });
        const created = await createQuiz.mutateAsync(input);
        setSavedNewQuiz(true);
        setTitle(created.title);
        setDescription(created.description ?? "");
        setSuccess("Quiz created. Add questions below.");
        allowSavedNavigation.current = true;
        navigate(
          `${quizzesPath}/${encodeURIComponent(created.id)}?tab=content&expandedTopicId=${encodedTopicId}`,
        );
      } else {
        const input = updateTeacherQuizRequestSchema.parse({
          title: values.data.title,
          description: values.data.description.trim() || null,
        });
        await updateQuiz.mutateAsync(input);
        setSuccess("Quiz details saved.");
      }
    } catch (error) {
      setFormError(
        errorMessage(
          error,
          "We couldn't save the quiz. Your changes are still here.",
        ),
      );
    }
  }

  async function addQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const input = createTeacherQuizQuestionRequestSchema.safeParse({
      questionText: newQuestionText,
    });
    if (!input.success) {
      setFormError(input.error.issues[0]?.message ?? "Enter question text.");
      return;
    }

    try {
      await createQuestion.mutateAsync(input.data);
      setNewQuestionText("");
      setSuccess("Question added.");
    } catch (error) {
      setFormError(
        errorMessage(
          error,
          "We couldn't add the question. Your text is preserved.",
        ),
      );
    }
  }

  function moveQuestion(index: number, offset: -1 | 1) {
    const questions = questionsQuery.data?.items ?? [];
    const target = index + offset;
    if (
      !canEdit ||
      reorderQuestions.isPending ||
      target < 0 ||
      target >= questions.length
    ) {
      return;
    }
    const questionIds = questions.map((question) => question.id);
    [questionIds[index], questionIds[target]] = [
      questionIds[target],
      questionIds[index],
    ];
    reorderQuestions.reset();
    reorderQuestions.mutate({ questionIds });
  }

  const retrySession = () => {
    void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
  };

  let body: React.ReactNode;
  if (!parsedParent.success || (!isCreating && !parsedQuiz?.success)) {
    body = (
      <Notice error title="Invalid quiz link">
        <p>The course, topic, or quiz address is invalid.</p>
      </Notice>
    );
  } else if (courseQuery.authorizationStatus === "loading") {
    body = (
      <Notice title="Checking Teacher access">
        <p>Please wait while your session is checked.</p>
      </Notice>
    );
  } else if (courseQuery.authorizationStatus === "unauthenticated") {
    body = (
      <Notice error title="Sign in to manage quizzes">
        <Link to="/login">Sign in</Link>
      </Notice>
    );
  } else if (courseQuery.authorizationStatus === "forbidden") {
    body = (
      <Notice error title="Teacher access required">
        <p>This course is not available to your account.</p>
      </Notice>
    );
  } else if (courseQuery.authorizationStatus === "error") {
    body = (
      <Notice error title="We couldn't check your session">
        <button
          className="min-h-11 rounded-md border border-border px-4"
          onClick={retrySession}
          type="button"
        >
          Try again
        </button>
      </Notice>
    );
  } else if (courseQuery.isPending || topicQuery.isPending) {
    body = (
      <Notice title="Loading quiz workspace">
        <p>Course and topic details are loading.</p>
      </Notice>
    );
  } else if (courseQuery.isError || !course) {
    body = (
      <Notice error title="Course not found">
        <p>This course is unavailable to your account.</p>
      </Notice>
    );
  } else if (topicQuery.isError || !topic) {
    body = (
      <Notice error title="Topic not found">
        <p>This topic is unavailable in this course.</p>
      </Notice>
    );
  } else if (!isCreating && quizQuery.authorizationStatus !== "authorized") {
    body = (
      <Notice error title="Teacher access required">
        <p>The quiz is available only to its Teacher owner.</p>
      </Notice>
    );
  } else if (!isCreating && quizQuery.isPending) {
    body = (
      <Notice title="Loading quiz">
        <p>Quiz details are loading.</p>
      </Notice>
    );
  } else if (!isCreating && (quizQuery.isError || !quiz)) {
    body = (
      <Notice error title="Quiz not found">
        <p>This quiz is unavailable in the selected topic.</p>
      </Notice>
    );
  } else {
    const questions = questionsQuery.data?.items ?? [];
    const saving = createQuiz.isPending || updateQuiz.isPending;

    body = (
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link
                className="text-primary underline"
                to={`/teacher/courses/${encodedCourseId}`}
              >
                {course.title}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                className="text-primary underline"
                to={`/teacher/courses/${encodedCourseId}/topics/${encodedTopicId}`}
              >
                {topic.title}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">{isCreating ? "New quiz" : quiz?.title}</li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {isCreating ? "Create quiz" : quiz?.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.title} · {topic.title}
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-border px-4 font-semibold text-primary"
            to={returnToContent}
          >
            Back to Course Content
          </Link>
        </div>

        <section
          aria-labelledby="quiz-details-heading"
          className="space-y-4 rounded-lg border border-border bg-surface p-5"
        >
          <h2
            className="text-lg font-semibold text-foreground"
            id="quiz-details-heading"
          >
            Quiz details
          </h2>
          <form className="space-y-4" onSubmit={saveQuiz}>
            <div>
              <label className="mb-1 block font-medium" htmlFor="quiz-title">
                Quiz title
              </label>
              <input
                className={fieldClass}
                disabled={!canEdit || saving}
                id="quiz-title"
                maxLength={QUIZ_TITLE_MAX_LENGTH}
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
            </div>
            <div>
              <label
                className="mb-1 block font-medium"
                htmlFor="quiz-description"
              >
                Description (optional)
              </label>
              <textarea
                className={`${fieldClass} min-h-24`}
                disabled={!canEdit || saving}
                id="quiz-description"
                maxLength={QUIZ_DESCRIPTION_MAX_LENGTH}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </div>
            {canEdit && (
              <button
                className="min-h-11 rounded-md bg-primary px-4 font-semibold text-inverse disabled:opacity-50"
                disabled={saving || (!quizDirty && !isCreating)}
                type="submit"
              >
                {saving
                  ? "Saving quiz…"
                  : isCreating
                    ? "Create quiz"
                    : "Save quiz details"}
              </button>
            )}
            {!canEdit && (
              <p className="text-sm text-muted-foreground">
                This course is read-only because it is not a draft.
              </p>
            )}
          </form>
        </section>

        {formError && (
          <p className="flex gap-2 text-sm text-danger" role="alert">
            <AlertCircle aria-hidden="true" className="size-4" />
            {formError}
          </p>
        )}
        {success && (
          <p className="text-sm text-success" role="status">
            {success}
          </p>
        )}
        {createQuiz.isError && (
          <p role="alert">
            {errorMessage(createQuiz.error, "Quiz creation failed.")}
          </p>
        )}
        {updateQuiz.isError && (
          <p role="alert">
            {errorMessage(updateQuiz.error, "Quiz update failed.")}
          </p>
        )}

        {!isCreating && quiz && (
          <section aria-labelledby="questions-heading" className="space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h2
                className="text-xl font-semibold text-foreground"
                id="questions-heading"
              >
                Questions
              </h2>
              {canEdit && (
                <form
                  className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"
                  onSubmit={addQuestion}
                >
                  <label className="sr-only" htmlFor="new-question-text">
                    New question text
                  </label>
                  <input
                    className={fieldClass}
                    disabled={createQuestion.isPending}
                    id="new-question-text"
                    maxLength={5000}
                    onChange={(event) => setNewQuestionText(event.target.value)}
                    value={newQuestionText}
                  />
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 font-semibold text-inverse disabled:opacity-50"
                    disabled={
                      createQuestion.isPending || !newQuestionText.trim()
                    }
                    type="submit"
                  >
                    {createQuestion.isPending ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : (
                      <Plus aria-hidden="true" className="size-4" />
                    )}
                    Add question
                  </button>
                </form>
              )}
            </header>

            {questionsQuery.isPending ? (
              <p role="status">Loading questions…</p>
            ) : questionsQuery.isError ? (
              <section
                role="alert"
                className="space-y-2 rounded-lg border border-danger p-4"
              >
                <p>
                  {errorMessage(
                    questionsQuery.error,
                    "We couldn't load the questions.",
                  )}
                </p>
                <button
                  className="min-h-11 rounded-md border border-border px-4"
                  disabled={questionsQuery.isFetching}
                  onClick={() => void questionsQuery.refetch()}
                  type="button"
                >
                  Try again
                </button>
              </section>
            ) : questions.length === 0 ? (
              <p
                className="rounded-md border border-border bg-surface p-4 text-sm text-muted-foreground"
                role="status"
              >
                This quiz has no questions yet. Add a question to begin drafting
                it.
              </p>
            ) : (
              <ol aria-label="Quiz questions" className="space-y-4">
                {questions.map((question, index) => (
                  <li key={question.id}>
                    <QuizQuestionEditor
                      canEdit={Boolean(canEdit)}
                      courseId={course.id}
                      index={index}
                      isReorderingQuestions={reorderQuestions.isPending}
                      onDirtyChange={setPartDirty}
                      onMoveQuestion={moveQuestion}
                      question={question}
                      questionCount={questions.length}
                      quizId={quiz.id}
                      topicId={topic.id}
                    />
                  </li>
                ))}
              </ol>
            )}
            {createQuestion.isError && (
              <p className="text-sm text-danger" role="alert">
                {errorMessage(
                  createQuestion.error,
                  "We couldn't add this question.",
                )}
              </p>
            )}
            {reorderQuestions.isError && (
              <p className="text-sm text-danger" role="alert">
                {errorMessage(
                  reorderQuestions.error,
                  "We couldn't reorder questions. The saved order was refreshed.",
                )}
              </p>
            )}
            {reorderQuestions.isPending && (
              <p role="status">Saving question order…</p>
            )}
          </section>
        )}
      </main>
    );
  }

  return body;
}
