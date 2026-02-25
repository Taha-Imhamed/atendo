import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { ApiError } from "../errors/apiError";
import { courses, enrollments, groups, sessions } from "@shared/schema";

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

    const activeSessionByGroup = new Map<string, string>();
    for (const row of activeSessionRows) {
      if (!activeSessionByGroup.has(row.groupId)) {
        activeSessionByGroup.set(row.groupId, row.sessionId);
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
