import { eq, inArray, sql } from "drizzle-orm";
import { ApiError } from "../errors/apiError";
import { db } from "../db";
import {
  account_credentials,
  attendance_policies,
  attendance_records,
  attendance_rounds,
  audit_logs,
  courses,
  excuse_requests,
  fraud_signals,
  professor_profiles,
  qr_tokens,
  sessions,
  student_profiles,
  users,
} from "@shared/schema";
import { courseService } from "./courseService";

export const adminProfessorService = {
  async listProfessors() {
    const professorRows = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        display_name: users.display_name,
        created_at: users.created_at,
        last_login_at: users.last_login_at,
      })
      .from(users)
      .where(eq(users.role, "professor"));

    if (!professorRows.length) {
      return [];
    }

    const professorIds = professorRows.map((row) => row.id);

    const courseCounts = await db
      .select({
        professorId: courses.professor_id,
        count: sql<number>`COUNT(${courses.id})`,
      })
      .from(courses)
      .where(inArray(courses.professor_id, professorIds))
      .groupBy(courses.professor_id);

    const studentCounts = await db
      .select({
        professorId: users.created_by_professor_id,
        count: sql<number>`COUNT(${users.id})`,
      })
      .from(users)
      .where(inArray(users.created_by_professor_id, professorIds))
      .groupBy(users.created_by_professor_id);

    const courseCountByProfessor = new Map(
      courseCounts.map((row) => [row.professorId, Number(row.count ?? 0)]),
    );
    const studentCountByProfessor = new Map(
      studentCounts.map((row) => [row.professorId, Number(row.count ?? 0)]),
    );

    return professorRows
      .map((row) => ({
        ...row,
        courseCount: courseCountByProfessor.get(row.id) ?? 0,
        studentCount: studentCountByProfessor.get(row.id) ?? 0,
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  },

  async deleteProfessor(adminId: string, professorId: string) {
    if (adminId === professorId) {
      throw new ApiError(400, "You cannot delete your own account.");
    }

    const [professor] = await db
      .select()
      .from(users)
      .where(eq(users.id, professorId))
      .limit(1);

    if (!professor || professor.role !== "professor") {
      throw new ApiError(404, "Professor not found.");
    }

    const courseRows = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.professor_id, professorId));

    for (const course of courseRows) {
      await courseService.deleteCourse(professorId, course.id);
    }

    const sessionRows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.professor_id, professorId));
    const sessionIds = sessionRows.map((row) => row.id);

    if (sessionIds.length > 0) {
      const roundRows = await db
        .select({ id: attendance_rounds.id })
        .from(attendance_rounds)
        .where(inArray(attendance_rounds.session_id, sessionIds));
      const roundIds = roundRows.map((row) => row.id);

      if (roundIds.length > 0) {
        await db.delete(excuse_requests).where(inArray(excuse_requests.round_id, roundIds));
        await db.delete(attendance_records).where(
          inArray(attendance_records.round_id, roundIds),
        );
        await db.delete(qr_tokens).where(inArray(qr_tokens.round_id, roundIds));
        await db.delete(fraud_signals).where(inArray(fraud_signals.round_id, roundIds));
      }

      await db.delete(attendance_rounds).where(
        inArray(attendance_rounds.session_id, sessionIds),
      );
      await db.delete(sessions).where(inArray(sessions.id, sessionIds));
    }

    await db
      .delete(account_credentials)
      .where(eq(account_credentials.created_by_professor_id, professorId));
    await db
      .update(users)
      .set({ created_by_professor_id: null })
      .where(eq(users.created_by_professor_id, professorId));
    await db
      .update(student_profiles)
      .set({ created_by_professor_id: null })
      .where(eq(student_profiles.created_by_professor_id, professorId));
    await db
      .update(attendance_policies)
      .set({ created_by: null })
      .where(eq(attendance_policies.created_by, professorId));
    await db
      .update(audit_logs)
      .set({ actor_id: null })
      .where(eq(audit_logs.actor_id, professorId));
    await db
      .delete(professor_profiles)
      .where(eq(professor_profiles.user_id, professorId));
    await db.delete(users).where(eq(users.id, professorId));

    return { deleted: true };
  },
};
