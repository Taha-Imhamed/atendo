import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  attendance_rounds,
  courses,
  enrollments,
  groups,
  sessions,
} from "@shared/schema";

export const studentService = {
  /**
   * Returns enrollments for a student with active session/round hints.
   */
  async getEnrollments(studentId: string) {
    const rows = await db
      .select({
        enrollmentId: enrollments.id,
        course: courses,
        group: groups,
        activeSessionId: sql<string | null>`(
          SELECT s.id FROM ${sessions} s
          WHERE s.group_id = ${groups.id} AND s.is_active = ${true}
          ORDER BY s.starts_at DESC
          LIMIT 1
        )`,
        activeRoundId: sql<string | null>`(
          SELECT ar.id FROM ${attendance_rounds} ar
          JOIN ${sessions} s ON ar.session_id = s.id
          WHERE s.group_id = ${groups.id} AND s.is_active = ${true} AND ar.is_active = ${true}
          ORDER BY ar.round_number DESC
          LIMIT 1
        )`,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.course_id, courses.id))
      .innerJoin(groups, eq(enrollments.group_id, groups.id))
      .where(eq(enrollments.student_id, studentId));

    return rows.map((row) => ({
      enrollmentId: row.enrollmentId,
      course: {
        id: row.course.id,
        code: row.course.code,
        name: row.course.name,
        term: row.course.term,
        description: row.course.description ?? null,
      },
      group: {
        id: row.group.id,
        name: row.group.name,
        meeting_schedule: row.group.meeting_schedule ?? null,
      },
      activeSessionId: row.activeSessionId ?? null,
      activeRoundId: row.activeRoundId ?? null,
    }));
  },
};
