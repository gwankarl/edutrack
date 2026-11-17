export const teacherDashboardSummaryQueryKeys = {
  all: ["teachers", "dashboard-summary"] as const,
  forUser: (userId: string | null) =>
    ["teachers", "dashboard-summary", userId] as const,
};
