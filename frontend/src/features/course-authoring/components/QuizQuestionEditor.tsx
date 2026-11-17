import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  LoaderCircle,
  Plus,
} from "lucide-react";
import type {
  TeacherQuizQuestionResponse,
  TeacherQuizOptionResponse,
} from "@edutrack/contracts";
import {
  createTeacherQuizOptionRequestSchema,
  updateTeacherQuizQuestionRequestSchema,
  updateTeacherQuizOptionRequestSchema,
} from "@edutrack/contracts";

import { ApiError } from "../../../lib/api/api-error.js";
import {
  useCreateTeacherQuizOption,
  useReorderTeacherQuizOptions,
  useUpdateTeacherQuizOption,
  useUpdateTeacherQuizQuestion,
} from "../hooks/useQuizAuthoring.js";

const inputClass =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session expired. Sign in and try again.";
    if (error.status === 403)
      return "You no longer have permission to edit this course.";
    if (error.status === 404)
      return "This quiz or question is no longer available.";
    if (error.status === 409)
      return "The course is no longer a draft or the answer conflicts with a recent change. Refresh and try again.";
    if (error.status === 400) return "Check the entered details and try again.";
  }

  return fallback;
}

function QuizOptionRow({
  courseId,
  topicId,
  quizId,
  questionId,
  option,
  index,
  optionCount,
  canEdit,
  isReordering,
  onMove,
  onDirtyChange,
}: {
  courseId: string;
  topicId: string;
  quizId: string;
  questionId: string;
  option: TeacherQuizOptionResponse;
  index: number;
  optionCount: number;
  canEdit: boolean;
  isReordering: boolean;
  onMove: (index: number, offset: -1 | 1) => void;
  onDirtyChange: (key: string, dirty: boolean) => void;
}) {
  const update = useUpdateTeacherQuizOption(
    courseId,
    topicId,
    quizId,
    questionId,
    option.id,
  );
  const [text, setText] = useState(option.optionText);
  const [validationError, setValidationError] = useState<string | null>(null);
  const dirty = text.trim() !== option.optionText;

  useEffect(() => {
    setText(option.optionText);
  }, [option.id, option.optionText]);

  useEffect(() => {
    onDirtyChange(`option:${questionId}:${option.id}`, dirty);
  }, [dirty, onDirtyChange, option.id, questionId]);

  async function saveText() {
    if (!dirty || update.isPending) return;
    const parsed = updateTeacherQuizOptionRequestSchema.safeParse({
      optionText: text,
    });
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues[0]?.message ?? "Enter answer option text.",
      );
      return;
    }
    setValidationError(null);
    try {
      await update.mutateAsync(parsed.data);
    } catch {
      // The mutation exposes its error state below.
    }
  }

  async function markCorrect() {
    if (option.isCorrect || update.isPending) return;
    try {
      await update.mutateAsync({ isCorrect: true });
    } catch {
      // The mutation exposes its error state below.
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <input
          aria-label={`Correct answer for option ${index + 1}`}
          checked={option.isCorrect}
          className="mt-3 size-4 accent-primary"
          disabled={!canEdit || update.isPending}
          name={`correct-answer-${questionId}`}
          onChange={() => void markCorrect()}
          type="radio"
        />
        <div className="min-w-0 flex-1">
          <label
            className="mb-1 block text-sm font-medium text-foreground"
            htmlFor={`option-text-${questionId}-${option.id}`}
          >
            Option {index + 1}
          </label>
          <input
            className={inputClass}
            disabled={!canEdit || update.isPending}
            id={`option-text-${questionId}-${option.id}`}
            maxLength={1000}
            onChange={(event) => {
              setText(event.target.value);
              setValidationError(null);
            }}
            value={text}
          />
          {canEdit && (
            <button
              className="mt-2 min-h-10 rounded-md px-3 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
              disabled={!dirty || update.isPending}
              onClick={() => void saveText()}
              type="button"
            >
              {update.isPending ? "Saving…" : "Save option"}
            </button>
          )}
          {validationError && (
            <p className="mt-1 text-sm text-danger" role="alert">
              {validationError}
            </p>
          )}
          {option.isCorrect && (
            <p className="mt-1 flex items-center gap-1 text-sm text-success">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Correct answer
            </p>
          )}
          {update.isError && (
            <p className="mt-1 text-sm text-danger" role="alert">
              {getErrorMessage(update.error, "We couldn't save this option.")}
            </p>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex gap-1">
          <button
            aria-label={`Move option ${index + 1} up`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border disabled:opacity-50"
            disabled={index === 0 || isReordering}
            onClick={() => onMove(index, -1)}
            type="button"
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label={`Move option ${index + 1} down`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border disabled:opacity-50"
            disabled={index === optionCount - 1 || isReordering}
            onClick={() => onMove(index, 1)}
            type="button"
          >
            <ArrowDown aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}

export default function QuizQuestionEditor({
  courseId,
  topicId,
  quizId,
  question,
  index,
  questionCount,
  canEdit,
  isReorderingQuestions,
  onMoveQuestion,
  onDirtyChange,
}: {
  courseId: string;
  topicId: string;
  quizId: string;
  question: TeacherQuizQuestionResponse;
  index: number;
  questionCount: number;
  canEdit: boolean;
  isReorderingQuestions: boolean;
  onMoveQuestion: (index: number, offset: -1 | 1) => void;
  onDirtyChange: (key: string, dirty: boolean) => void;
}) {
  const updateQuestion = useUpdateTeacherQuizQuestion(
    courseId,
    topicId,
    quizId,
    question.id,
  );
  const createOption = useCreateTeacherQuizOption(
    courseId,
    topicId,
    quizId,
    question.id,
  );
  const reorderOptions = useReorderTeacherQuizOptions(
    courseId,
    topicId,
    quizId,
    question.id,
  );

  const [questionText, setQuestionText] = useState(question.questionText);
  const [questionValidationError, setQuestionValidationError] = useState<
    string | null
  >(null);
  const [newOptionText, setNewOptionText] = useState("");
  const questionDirty = questionText.trim() !== question.questionText;

  useEffect(() => {
    setQuestionText(question.questionText);
  }, [question.id, question.questionText]);

  useEffect(() => {
    onDirtyChange(`question:${question.id}`, questionDirty);
  }, [onDirtyChange, question.id, questionDirty]);

  useEffect(() => {
    onDirtyChange(`new-option:${question.id}`, newOptionText.trim().length > 0);
  }, [newOptionText, onDirtyChange, question.id]);

  async function saveQuestion() {
    const parsed = updateTeacherQuizQuestionRequestSchema.safeParse({
      questionText,
    });
    if (updateQuestion.isPending) return;
    if (!parsed.success) {
      setQuestionValidationError(
        parsed.error.issues[0]?.message ?? "Enter question text.",
      );
      return;
    }
    setQuestionValidationError(null);

    try {
      const saved = await updateQuestion.mutateAsync(parsed.data);
      setQuestionText(saved.questionText);
    } catch {
      // The mutation exposes its error state below.
    }
  }

  async function addOption(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createTeacherQuizOptionRequestSchema.safeParse({
      optionText: newOptionText,
      isCorrect: false,
    });
    if (!parsed.success || createOption.isPending) return;

    try {
      await createOption.mutateAsync(parsed.data);
      setNewOptionText("");
    } catch {
      // Keep the input so the teacher can retry.
    }
  }

  function moveOption(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (
      !canEdit ||
      reorderOptions.isPending ||
      target < 0 ||
      target >= question.options.length
    ) {
      return;
    }

    const optionIds = question.options.map((option) => option.id);
    [optionIds[index], optionIds[target]] = [
      optionIds[target],
      optionIds[index],
    ];
    reorderOptions.reset();
    reorderOptions.mutate({ optionIds });
  }

  const correctCount = question.options.filter(
    (option) => option.isCorrect,
  ).length;
  const ready = question.options.length >= 2 && correctCount === 1;

  return (
    <section
      aria-labelledby={`question-heading-${question.id}`}
      className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3
          className="font-semibold text-foreground"
          id={`question-heading-${question.id}`}
        >
          Question {question.position}
        </h3>
        {canEdit && (
          <div className="flex gap-1">
            <button
              aria-label={`Move question ${question.position} up`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border disabled:opacity-50"
              disabled={index === 0 || isReorderingQuestions}
              onClick={() => onMoveQuestion(index, -1)}
              type="button"
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label={`Move question ${question.position} down`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border disabled:opacity-50"
              disabled={index === questionCount - 1 || isReorderingQuestions}
              onClick={() => onMoveQuestion(index, 1)}
              type="button"
            >
              <ArrowDown aria-hidden="true" className="size-4" />
            </button>
          </div>
        )}
      </header>

      <div>
        <label
          className="mb-1 block text-sm font-medium text-foreground"
          htmlFor={`question-text-${question.id}`}
        >
          Question text
        </label>
        <textarea
          aria-describedby={`question-help-${question.id}`}
          className={`${inputClass} min-h-24`}
          disabled={!canEdit || updateQuestion.isPending}
          id={`question-text-${question.id}`}
          maxLength={5000}
          onChange={(event) => {
            setQuestionText(event.target.value);
            setQuestionValidationError(null);
          }}
          value={questionText}
        />
        <p
          className="mt-1 text-sm text-muted-foreground"
          id={`question-help-${question.id}`}
        >
          Single-answer multiple choice. You can save an incomplete draft.
        </p>
        {questionValidationError && (
          <p className="mt-1 text-sm text-danger" role="alert">
            {questionValidationError}
          </p>
        )}
        {canEdit && (
          <button
            className="mt-2 min-h-10 rounded-md bg-primary px-4 font-semibold text-inverse disabled:opacity-50"
            disabled={!questionDirty || updateQuestion.isPending}
            onClick={() => void saveQuestion()}
            type="button"
          >
            {updateQuestion.isPending ? "Saving question…" : "Save question"}
          </button>
        )}
        {updateQuestion.isError && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {getErrorMessage(
              updateQuestion.error,
              "We couldn't save this question.",
            )}
          </p>
        )}
      </div>

      <section aria-label={`Answer options for question ${question.position}`}>
        <h4 className="mb-2 font-medium text-foreground">Answer options</h4>
        {question.options.length === 0 ? (
          <p
            className="rounded-md border border-border p-3 text-sm text-muted-foreground"
            role="status"
          >
            No answer options yet. Add options while the course is a draft.
          </p>
        ) : (
          <ol className="space-y-2">
            {question.options.map((option, optionIndex) => (
              <QuizOptionRow
                canEdit={canEdit}
                courseId={courseId}
                index={optionIndex}
                isReordering={reorderOptions.isPending}
                key={option.id}
                onDirtyChange={onDirtyChange}
                onMove={moveOption}
                option={option}
                optionCount={question.options.length}
                questionId={question.id}
                quizId={quizId}
                topicId={topicId}
              />
            ))}
          </ol>
        )}
        {canEdit && (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={addOption}
          >
            <label className="sr-only" htmlFor={`new-option-${question.id}`}>
              New answer option for question {question.position}
            </label>
            <input
              className={inputClass}
              disabled={createOption.isPending}
              id={`new-option-${question.id}`}
              maxLength={1000}
              onChange={(event) => setNewOptionText(event.target.value)}
              value={newOptionText}
            />
            <button
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-4 font-semibold text-primary disabled:opacity-50"
              disabled={createOption.isPending || !newOptionText.trim()}
              type="submit"
            >
              {createOption.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : (
                <Plus aria-hidden="true" className="size-4" />
              )}
              Add option
            </button>
          </form>
        )}
        {createOption.isError && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {getErrorMessage(
              createOption.error,
              "We couldn't add this option.",
            )}
          </p>
        )}
        {reorderOptions.isError && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {getErrorMessage(
              reorderOptions.error,
              "We couldn't reorder options. The saved order was refreshed.",
            )}
          </p>
        )}
      </section>

      <p
        aria-live="polite"
        className={`flex items-center gap-2 text-sm ${ready ? "text-success" : "text-muted-foreground"}`}
        role="status"
      >
        {ready ? (
          <>
            <CheckCircle2 aria-hidden="true" className="size-4" />
            One correct answer and at least two options are set.
          </>
        ) : (
          <>
            <AlertCircle aria-hidden="true" className="size-4" />
            Draft incomplete: add at least two options and select one correct
            answer when ready.
          </>
        )}
      </p>
    </section>
  );
}
