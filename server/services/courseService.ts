import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { ApiError } from "../errors/apiError";
import {
  attendance_policies,
  attendance_policy_history,
  attendance_records,
  attendance_rounds,
  course_policy_assignments,
  courses,
  enrollments,
  excuse_requests,
  fraud_signals,
  groups,
  qr_tokens,
  sessions,
} from "@shared/schema";
import { auditService } from "./auditService";

export const courseService = {
  /**
   * Creates a new course for the given professor along with a default group.
   */
  async createCourse(
    professorId: string,
    payload: { code: string; name: string; term?: string; description?: string },
  ) {
    if (!payload.code || !payload.name) {
      throw new ApiError(400, "Course code and name are required");
    }

    const [course] = await db.insert(courses).values({
      professor_id: professorId,
      code: payload.code,
      name: payload.name,
      term: payload.term ?? "TBD",
      description: payload.description,
    }).returning();

    const [defaultGroup] = await db
      .insert(groups)
      .values({
        course_id: course.id,
        name: "Group A",
        meeting_schedule: payload.term ?? "TBD",
      })
      .returning();

    return { course, defaultGroup };
  },

  /**
   * Creates an additional group under a professor-owned course.
   */
  async createGroup(
    professorId: string,
    courseId: string,
    payload: { name: string; meeting_schedule?: string },
  ) {
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new ApiError(404, "Course not found");
    }

    if (course.professor_id !== professorId) {
      throw new ApiError(403, "Only the course owner can create groups");
    }

    const [group] = await db.insert(groups).values({
      course_id: course.id,
      name: payload.name,
      meeting_schedule: payload.meeting_schedule,
    }).returning();

    return group;
  },

  async deleteCourse(professorId: string, courseId: string) {
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new ApiError(404, "Course not found");
    }

    if (course.professor_id !== professorId) {
      throw new ApiError(403, "Only the course owner can delete this course");
    }

    const groupRows = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.course_id, courseId));
    const groupIds = groupRows.map((group) => group.id);

    const sessionRows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.course_id, courseId));
    const sessionIds = sessionRows.map((session) => session.id);

    const roundRows =
      sessionIds.length > 0
        ? await db
            .select({ id: attendance_rounds.id })
            .from(attendance_rounds)
            .where(inArray(attendance_rounds.session_id, sessionIds))
        : [];
    const roundIds = roundRows.map((round) => round.id);

    const courseScopedPolicies = await db
      .select({ id: attendance_policies.id })
      .from(attendance_policies)
      .where(
        and(
          eq(attendance_policies.scope_type, "course"),
          eq(attendance_policies.scope_id, courseId),
        ),
      );
    const coursePolicyIds = courseScopedPolicies.map((policy) => policy.id);

    if (roundIds.length > 0) {
      await db.delete(excuse_requests).where(inArray(excuse_requests.round_id, roundIds));
      await db.delete(attendance_records).where(inArray(attendance_records.round_id, roundIds));
      await db.delete(qr_tokens).where(inArray(qr_tokens.round_id, roundIds));
      await db.delete(fraud_signals).where(inArray(fraud_signals.round_id, roundIds));
    }

    if (sessionIds.length > 0) {
      await db.delete(fraud_signals).where(inArray(fraud_signals.session_id, sessionIds));
      await db.delete(attendance_rounds).where(inArray(attendance_rounds.session_id, sessionIds));
      await db.delete(sessions).where(inArray(sessions.id, sessionIds));
    }

    if (groupIds.length > 0) {
      await db.delete(enrollments).where(inArray(enrollments.group_id, groupIds));
      await db.delete(groups).where(inArray(groups.id, groupIds));
    } else {
      await db.delete(enrollments).where(eq(enrollments.course_id, courseId));
    }

    await db
      .delete(course_policy_assignments)
      .where(eq(course_policy_assignments.course_id, courseId));

    if (coursePolicyIds.length > 0) {
      await db
        .delete(attendance_policy_history)
        .where(inArray(attendance_policy_history.policy_id, coursePolicyIds));
      await db
        .delete(attendance_policies)
        .where(inArray(attendance_policies.id, coursePolicyIds));
    }

    await db.delete(courses).where(eq(courses.id, courseId));

    await auditService.log({
      actorId: professorId,
      action: "course_delete",
      entityType: "course",
      entityId: courseId,
      before: course,
      after: null,
    });

    return { deleted: true };
  },

  /**
   * Lists all courses for a professor including group and enrollment summaries.
   */
  async listProfessorCourses(professorId: string) {
    const courseRows = await db
      .select()
      .from(courses)
      .where(eq(courses.professor_id, professorId));

    if (courseRows.length === 0) {
      return [];
    }

    const courseIds = courseRows.map((course) => course.id);
    const groupRows = await db
      .select({
        group: groups,
        enrollmentCount: sql<number>`COUNT(${enrollments.id})`,
      })
      .from(groups)
      .leftJoin(enrollments, eq(enrollments.group_id, groups.id))
      .where(inArray(groups.course_id, courseIds))
      .groupBy(
        groups.id,
        groups.course_id,
        groups.name,
        groups.meeting_schedule,
        groups.created_at,
      );

    const activeSessionRows = await db
      .select({
        groupId: sessions.group_id,
        sessionId: sessions.id,
      })
      .from(sessions)
      .where(
        and(
          inArray(sessions.course_id, courseIds),
          eq(sessions.is_active, true),
        ),
      );

    const latestSessionRows = await db
      .select({
        courseId: sessions.course_id,
        sessionId: sessions.id,
      })
      .from(sessions)
      .where(inArray(sessions.course_id, courseIds))
      .orderBy(desc(sessions.starts_at));

    const activeSessionByGroup = new Map<string, string>();
    for (const row of activeSessionRows) {
      if (!activeSessionByGroup.has(row.groupId)) {
        activeSessionByGroup.set(row.groupId, row.sessionId);
      }
    }

    const latestSessionByCourse = new Map<string, string>();
    for (const row of latestSessionRows) {
      if (!latestSessionByCourse.has(row.courseId)) {
        latestSessionByCourse.set(row.courseId, row.sessionId);
      }
    }

    const courseMap = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        term: string;
        description: string | null;
        latestSessionId: string | null;
        groups: Array<{
          id: string;
          name: string;
          meeting_schedule: string | null;
          enrollmentCount: number;
          activeSessionId: string | null;
        }>;
        totalStudents: number;
      }
    >();

    for (const course of courseRows) {
      courseMap.set(course.id, {
        id: course.id,
        code: course.code,
        name: course.name,
        term: course.term,
        description: course.description ?? null,
        latestSessionId: latestSessionByCourse.get(course.id) ?? null,
        groups: [],
        totalStudents: 0,
      });
    }

    for (const row of groupRows) {
      const entry = courseMap.get(row.group.course_id);
      if (!entry) continue;
      const enrollmentCount = Number(row.enrollmentCount ?? 0);
      entry.groups.push({
        id: row.group.id,
        name: row.group.name,
        meeting_schedule: row.group.meeting_schedule ?? null,
        enrollmentCount,
        activeSessionId: activeSessionByGroup.get(row.group.id) ?? null,
      });
      entry.totalStudents += enrollmentCount;
    }

    return Array.from(courseMap.values());
  },
};
