import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { account_credentials } from "@shared/schema";

function shouldIgnoreCredentialError(error: unknown) {
  if (!error) return false;
  const message =
    typeof (error as { message?: unknown }).message === "string"
      ? ((error as { message?: unknown }).message as string).toLowerCase()
      : "";
  const code =
    typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code?: unknown }).code as string)
      : "";
  if (code === "42P01" || code === "42703") {
    return true; // Postgres: undefined table / column
  }
  return (
    message.includes("no such table") ||
    message.includes("account_credentials") && message.includes("no such")
  );
}

export const accountCredentialService = {
  async recordCredential(
    professorId: string,
    studentId: string,
    plainPassword: string,
    source: "manual_create" | "import" | "reset",
  ) {
    try {
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
    } catch (error) {
      if (shouldIgnoreCredentialError(error)) {
        return null;
      }
      throw error;
    }
  },

  async deactivateForStudent(studentId: string) {
    try {
      await db
        .update(account_credentials)
        .set({ is_active: false })
        .where(eq(account_credentials.student_id, studentId));
    } catch (error) {
      if (shouldIgnoreCredentialError(error)) {
        return;
      }
      throw error;
    }
  },

  async listActiveForStudents(studentIds: string[]) {
    if (!studentIds.length) {
      return [];
    }

    try {
      return await db
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
    } catch (error) {
      if (shouldIgnoreCredentialError(error)) {
        return [];
      }
      throw error;
    }
  },
};
