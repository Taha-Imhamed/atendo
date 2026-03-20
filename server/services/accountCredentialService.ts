import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { account_credentials } from "@shared/schema";

export const accountCredentialService = {
  async recordCredential(
    professorId: string,
    studentId: string,
    plainPassword: string,
    source: "manual_create" | "import" | "reset",
  ) {
    await db
      .update(account_credentials)
      .set({ is_active: false })
      .where(eq(account_credentials.student_id, studentId));

    const [row] = await db
      .insert(account_credentials)
      .values({
        student_id: studentId,
        created_by_professor_id: professorId,
        plain_password: plainPassword,
        source,
        is_active: true,
      })
      .returning();

    return row;
  },

  async deactivateForStudent(studentId: string) {
    await db
      .update(account_credentials)
      .set({ is_active: false })
      .where(eq(account_credentials.student_id, studentId));
  },

  async listActiveForStudents(studentIds: string[]) {
    if (!studentIds.length) {
      return [];
    }

    return db
      .select({
        studentId: account_credentials.student_id,
        plainPassword: account_credentials.plain_password,
        source: account_credentials.source,
        createdAt: account_credentials.created_at,
      })
      .from(account_credentials)
      .where(
        and(
          inArray(account_credentials.student_id, studentIds),
          eq(account_credentials.is_active, true),
        ),
      );
  },
};
