import { ListFilter } from "lucide-react";
import type { TeacherApplicationStatus } from "@edutrack/contracts";

export type TeacherApplicationStatusFilter = TeacherApplicationStatus | "all";

export interface TeacherApplicationFiltersProps {
  status: TeacherApplicationStatusFilter;
  onStatusChange: (status: TeacherApplicationStatusFilter) => void;
}

export default function TeacherApplicationFilters({
  status,
  onStatusChange,
}: TeacherApplicationFiltersProps) {
  return (
    <div className="flex flex-col gap-2 sm:max-w-xs">
      <label
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
        htmlFor="teacher-application-status-filter"
      >
        <ListFilter aria-hidden="true" className="size-4 text-primary" />
        Filter by status
      </label>
      <select
        className="min-h-11 rounded-md border border-border bg-surface px-3 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        id="teacher-application-status-filter"
        onChange={(event) =>
          onStatusChange(event.target.value as TeacherApplicationStatusFilter)
        }
        value={status}
      >
        <option value="all">All applications</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
    </div>
  );
}
