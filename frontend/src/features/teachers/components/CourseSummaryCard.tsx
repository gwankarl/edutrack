import type { LucideIcon } from "lucide-react";

export interface CourseSummaryCardProps {
  label: string;
  value: number | null;
  icon: LucideIcon;
}

export default function CourseSummaryCard({
  label,
  value,
  icon: Icon,
}: CourseSummaryCardProps) {
  const isAvailable = value !== null;

  return (
    <article
      aria-label={`${label} summary`}
      className="flex min-h-32 items-start justify-between gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm"
    >
      <div className="min-w-0 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{label}</h3>
        <p className="text-3xl font-bold tracking-tight text-foreground">
          {isAvailable ? value.toLocaleString() : "Unavailable"}
        </p>
        {!isAvailable && (
          <p className="text-sm text-muted-foreground">
            This status is not supported yet.
          </p>
        )}
      </div>

      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-info-surface text-info"
      >
        <Icon className="size-5" />
      </span>
    </article>
  );
}
