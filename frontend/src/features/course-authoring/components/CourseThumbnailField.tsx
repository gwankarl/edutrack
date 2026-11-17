import { ImagePlus, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { CourseThumbnailResponse } from "@edutrack/contracts";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface CourseThumbnailSelection {
  file: File | null;
  removeExisting: boolean;
}

interface CourseThumbnailFieldProps {
  currentThumbnail?: CourseThumbnailResponse | null;
  disabled?: boolean;
  onChange: (selection: CourseThumbnailSelection) => void;
}

const buttonClassName =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 font-semibold text-foreground hover:bg-surface-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus disabled:cursor-not-allowed disabled:opacity-60";

export default function CourseThumbnailField({
  currentThumbnail,
  disabled = false,
  onChange,
}: CourseThumbnailFieldProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  function selectFile(file: File | undefined) {
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setError("The image must be 5 MB or smaller.");
      return;
    }

    setError(null);
    setSelectedFile(file);
    setRemoveExisting(false);
    onChange({ file, removeExisting: false });
  }

  function removeImage() {
    setError(null);
    setSelectedFile(null);

    const shouldRemoveExisting = Boolean(currentThumbnail);
    setRemoveExisting(shouldRemoveExisting);
    onChange({ file: null, removeExisting: shouldRemoveExisting });
  }

  function undoRemoval() {
    setError(null);
    setRemoveExisting(false);
    onChange({ file: null, removeExisting: false });
  }

  const showCurrentImage =
    Boolean(currentThumbnail) && !selectedFile && !removeExisting;

  return (
    <section aria-labelledby="course-cover-heading" className="space-y-3">
      <div className="space-y-1">
        <h2
          className="text-sm font-semibold text-foreground"
          id="course-cover-heading"
        >
          Course cover image{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </h2>
        <p className="text-sm text-muted-foreground" id="course-cover-help">
          JPEG, PNG, or WebP. Maximum 5 MB. Images are uploaded only when you
          save the course.
        </p>
      </div>

      <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-surface-muted">
        {previewUrl ? (
          <img
            alt="Selected course cover preview"
            className="size-full object-cover"
            src={previewUrl}
          />
        ) : showCurrentImage && currentThumbnail ? (
          <img
            alt="Current course cover image"
            className="size-full object-cover"
            src={currentThumbnail.url}
          />
        ) : (
          <div className="flex size-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {removeExisting
              ? "The current image will be removed when you save."
              : "No course cover image selected."}
          </div>
        )}
      </div>

      {selectedFile && (
        <p
          aria-live="polite"
          className="text-sm text-muted-foreground"
          role="status"
        >
          Selected image: {selectedFile.name} (not uploaded yet)
        </p>
      )}
      {showCurrentImage && (
        <p className="text-sm text-muted-foreground">Already uploaded</p>
      )}
      {error && (
        <p className="text-sm text-danger" id="course-cover-error" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <label className={buttonClassName}>
          <ImagePlus aria-hidden="true" className="size-4" />
          {selectedFile || currentThumbnail ? "Change image" : "Choose image"}
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-describedby={`course-cover-help${error ? " course-cover-error" : ""}`}
            aria-label="Course cover image"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              selectFile(event.currentTarget.files?.[0]);
              // Let the same file be selected again after validation or removal.
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>

        {(selectedFile || currentThumbnail) && !removeExisting && (
          <button
            className={buttonClassName}
            disabled={disabled}
            onClick={removeImage}
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Remove image
          </button>
        )}

        {removeExisting && currentThumbnail && (
          <button
            className={buttonClassName}
            disabled={disabled}
            onClick={undoRemoval}
            type="button"
          >
            <Undo2 aria-hidden="true" className="size-4" />
            Keep current image
          </button>
        )}
      </div>
    </section>
  );
}
