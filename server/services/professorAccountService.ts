import { and, eq, inArray } from "drizzle-orm";
import { ApiError } from "../errors/apiError";
import { db } from "../db";
import { courses, enrollments, users } from "@shared/schema";
import { accountCredentialService } from "./accountCredentialService";

async function managedStudentIds(professorId: string) {
  const createdRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.created_by_professor_id, professorId));

  const enrolledRows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(enrollments, eq(enrollments.student_id, users.id))
    .innerJoin(courses, eq(courses.id, enrollments.course_id))
    .where(eq(courses.professor_id, professorId));

  return new Set([...createdRows, ...enrolledRows].map((row) => row.id));
}

export const professorAccountService = {
  async listManagedUsers(professorId: string) {
    const ids = await managedStudentIds(professorId);
    ids.add(professorId);
    const targetIds = Array.from(ids);
    if (!targetIds.length) {
      return [];
    }

    const rows = await db
      .select({
        id: users.id,
        role: users.role,
        username: users.username,
        email: users.email,
        display_name: users.display_name,
        created_at: users.created_at,
        last_login_at: users.last_login_at,
      })
      .from(users)
      .where(inArray(users.id, targetIds));

    return rows.sort((a, b) => {
      if (a.role !== b.role) return a.role === "professor" ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
  },

  async updateManagedUser(
    professorId: string,
    targetUserId: string,
    payload: {
      username?: string;
      email?: string;
      display_name?: string;
    },
  ) {
    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);
    if (!target) {
      throw new ApiError(404, "User not found.");
    }

    if (target.id !== professorId) {
      const ids = await managedStudentIds(professorId);
      if (!ids.has(target.id)) {
        throw new ApiError(403, "You can only edit your managed accounts.");
      }
      if (target.role !== "student") {
        throw new ApiError(400, "Only student accounts can be edited.");
      }
    }

    const nextUsername = payload.username?.trim();
    const nextEmail = payload.email?.trim().toLowerCase();
    const nextDisplayName = payload.display_name?.trim();
    if (!nextUsername && !nextEmail && !nextDisplayName) {
      throw new ApiError(400, "No changes provided.");
    }

    if (nextUsername && nextUsername !== target.username) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, nextUsername))
        .limit(1);
      if (existing) {
        throw new ApiError(409, "Username already exists.");
      }
    }

    if (nextEmail && nextEmail !== target.email) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, nextEmail))
        .limit(1);
      if (existing) {
        throw new ApiError(409, "Email already exists.");
      }
    }

    const [updated] = await db
      .update(users)
      .set({
        username: nextUsername ?? target.username,
        email: nextEmail ?? target.email,
        display_name: nextDisplayName ?? target.display_name,
      })
      .where(eq(users.id, target.id))
      .returning({
        id: users.id,
        role: users.role,
        username: users.username,
        email: users.email,
        display_name: users.display_name,
      });

    return updated;
  },

  async exportManagedStudentsCsv(professorId: string) {
    const managed = await this.listManagedUsers(professorId);
    const students = managed.filter((row) => row.role === "student");
    const credentialRows = await accountCredentialService.listActiveForStudents(
      students.map((row) => row.id),
    );
    const passwordByStudentId = new Map(
      credentialRows.map((row) => [row.studentId, row.plainPassword]),
    );

    const escape = (value: string | number | null | undefined) => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
        return `"${str.replace(/\"/g, "\"\"")}"`;
      }
      return str;
    };

    const lines = [
      "display_name,email,username,password",
      ...students.map((row) =>
        [
          row.display_name,
          row.email,
          row.username,
          passwordByStudentId.get(row.id) ?? "",
        ]
          .map(escape)
          .join(","),
      ),
    ];

    return lines.join("\n");
  },
};
