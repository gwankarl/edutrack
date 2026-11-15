import { eq } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client.js";
import { teacherProfiles } from "../../infrastructure/database/schema/teacher-profiles.js";

/** Looks up a teacher profile by the trusted user ID. */
export function createTeacherProfileRepository(database: Database) {
  return {
    async findByUserId(userId: string): Promise<{ id: string } | null> {
      const [profile] = await database
        .select({ id: teacherProfiles.id })
        .from(teacherProfiles)
        .where(eq(teacherProfiles.userId, userId))
        .limit(1);

      return profile ?? null;
    },
  };
}
