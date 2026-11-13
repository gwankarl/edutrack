import { useQuery } from "@tanstack/react-query";

import { getBackendHealth } from "../api/health.api.js";

export default function BackendStatus() {
  const { data, isError, isPending } = useQuery({
    queryKey: ["system", "health"],
    queryFn: ({ signal }) => getBackendHealth(signal),
  });

  let message: string;
  let statusClassName: string;

  if (isPending) {
    message = "Checking backend availability…";
    statusClassName = "border-info bg-info-surface text-info";
  } else if (isError || data?.status !== "ok") {
    message = "The backend is unavailable. Please try again later.";
    statusClassName = "border-danger bg-danger-surface text-danger";
  } else {
    message = "The backend is available.";
    statusClassName = "border-success bg-success-surface text-success";
  }

  return (
    <section aria-labelledby="backend-status-heading" className="mt-6">
      <h2
        className="text-lg font-semibold text-foreground"
        id="backend-status-heading"
      >
        Service status
      </h2>
      <p
        aria-atomic="true"
        aria-live="polite"
        className={`mt-2 rounded-md border px-4 py-3 text-sm ${statusClassName}`}
        role="status"
      >
        {message}
      </p>
    </section>
  );
}
