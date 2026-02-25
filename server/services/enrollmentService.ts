import { and, asc, eq } from "drizzle-orm";
import { ApiError } from "../errors/apiError";
import { db } from "../db";
import { courses, enrollments, groups, users } from "@shared/schema";
import { userRepository } from "../repositories/userRepository";

type StudentSelector =
  | { studentId: string }
  | { username: string }
  | { email: string };

async function requireProfessorOwnedGroup(professorId: string, groupId: string) {
  const [row] = await db
    .select({
      group: groups,
      course: courses,
    })
    .from(groups)
    .innerJoin(courses, eq(groups.course_id, courses.id))
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!row) {
    throw new ApiError(404, "Group not found");
  }

  if (row.course.professor_id !== professorId) {
    throw new ApiError(403, "Only the course owner can manage enrollments");
  }

  return row;
}

async function resolveStudent(selector: StudentSelector) {
  let user;
  if ("studentId" in selector) {
    user = await userRepository.findById(selector.studentId);
  } else if ("username" in selector) {
    user = await userRepository.findByUsername(selector.username);
  } else {
    user = await userRepository.findByEmail(selector.email);
  }

  if (!user) {
    throw new ApiError(404, "Student not found");
  }

  if (user.role !== "student") {
    throw new ApiError(400, "Only student accounts can be enrolled");
  }

  return user;
}

export const enrollmentService = {
  async listGroupEnrollments(professorId: string, groupId: string) {
    const { group, course } = await requireProfessorOwnedGroup(professorId, groupId);

    const rows = await db
      .select({
        enrollmentId: enrollments.id,
        enrolledAt: enrollments.enrolled_at,
        student: {
          id: users.id,
          username: users.username,
          email: users.email,
          display_name: users.display_name,
        },
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.student_id, users.id))
      .where(eq(enrollments.group_id, groupId))
      .orderBy(asc(users.username));

    return {
      course: {
        id: course.id,
        code: course.code,
        name: course.name,
        term: course.term,
      },
      group: {
        id: group.id,
        name: group.name,
        meeting_schedule: group.meeting_schedule ?? null,
      },
      enrollments: rows.map((row) => ({
        id: row.enrollmentId,
        enrolledAt: row.enrolledAt,
        student: row.student,
      })),
    };
  },

  async addToGroup(
    professorId: string,
    groupId: string,
    selector: StudentSelector,
  ) {
    const { group, course } = await requireProfessorOwnedGroup(professorId, groupId);
    const student = await resolveStudent(selector);

    const [existing] = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.student_id, student.id),
          eq(enrollments.course_id, group.course_id),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.group_id === group.id) {
        return { enrollment: existing, moved: false, created: false };
      }

      const [updated] = await db
        .update(enrollments)
        .set({ group_id: group.id })
        .where(eq(enrollments.id, existing.id))
        .returning();

      return { enrollment: updated, moved: true, created: false };
    }

    const [enrollment] = await db
      .insert(enrollments)
      .values({
        student_id: student.id,
        course_id: course.id,
        group_id: group.id,
      })
      .returning();

    return { enrollment, moved: false, created: true };
  },

  async removeEnrollment(professorId: string, enrollmentId: string) {
    const [row] = await db
      .select({
        enrollment: enrollments,
        course: courses,
      })
      .from(enrollments)
      .innerJoin(courses, eq(enrollments.course_id, courses.id))
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (!row) {
      throw new ApiError(404, "Enrollment not found");
    }

    if (row.course.professor_id !== professorId) {
      throw new ApiError(403, "Only the course owner can manage enrollments");
    }

    await db.delete(enrollments).where(eq(enrollments.id, enrollmentId));
  },
};
