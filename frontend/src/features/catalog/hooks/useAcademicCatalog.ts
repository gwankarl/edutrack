import { useQuery } from "@tanstack/react-query";

import { getAcademicLevels, getSubjects } from "../api/academic-catalog.api.js";

export const academicCatalogQueryKey = ["catalog", "academic"] as const;

export function useAcademicCatalog() {
  return useQuery({
    queryKey: academicCatalogQueryKey,
    queryFn: async () => {
      const [academicLevelResponse, subjectResponse] = await Promise.all([
        getAcademicLevels(),
        getSubjects(),
      ]);

      return {
        academicLevels: academicLevelResponse.items,
        subjects: subjectResponse.items,
      };
    },
    staleTime: 5 * 60_000,
  });
}
