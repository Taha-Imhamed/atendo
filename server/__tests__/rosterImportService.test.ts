import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { db as runtimeDb } from "../db";
import {
  account_credentials,
  attendance_records,
  attendance_rounds,
  audit_logs,
  courses,
  enrollments,
  groups,
  qr_tokens,
  sessions,
  users,
  fraud_signals,
} from "@shared/schema";
import { rosterImportService } from "../services/rosterImportService";

type SqliteTestDb = ReturnType<typeof drizzleSqlite>;
const db: SqliteTestDb = runtimeDb as unknown as SqliteTestDb;

async function resetDb() {
  await db.delete(fraud_signals);
  await db.delete(audit_logs);
  await db.delete(account_credentials);
  await db.delete(attendance_records);
  await db.delete(qr_tokens);
  await db.delete(attendance_rounds);
  await db.delete(sessions);
  await db.delete(enrollments);
  await db.delete(groups);
  await db.delete(courses);
  await db.delete(users);
}

describe("rosterImportService.provisionFromFile", () => {
  beforeEach(resetDb);

  it("accepts username + full name roster format without email", async () => {
    const [professor] = await db
      .insert(users)
      .values({
        email: `prof-${Date.now()}@example.com`,
        username: `prof-${Date.now()}`,
        display_name: "Prof",
        password: "hashed",
        role: "professor",
      })
      .returning();

    const [course] = await db
      .insert(courses)
      .values({
        professor_id: professor.id,
        code: "CS-RI-1",
        name: "Roster Import",
        term: "Fall",
      })
      .returning();

    const [group] = await db
      .insert(groups)
      .values({
        course_id: course.id,
        name: "Group A",
      })
      .returning();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atendo-roster-"));
    const filePath = path.join(tempDir, "students.csv");
    fs.writeFileSync(
      filePath,
      [
        "username\tFull Name",
        "040223029\tAmbra Boci",
        "040223058\tAnas Abusifritah",
      ].join("\n"),
      "utf8",
    );

    try {
      const result = await rosterImportService.provisionFromFile({
        professorId: professor.id,
        groupId: group.id,
        filePath,
      });

      expect(result.created).toHaveLength(2);
      expect(result.created.map((row) => row.username).sort()).toEqual([
        "040223029",
        "040223058",
      ]);

      const [first] = await db
        .select()
        .from(users)
        .where(eq(users.username, "040223029"))
        .limit(1);
      expect(first.email).toBe("040223029@unyt.edu.al");

      const enrollRows = await db
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.course_id, course.id), eq(enrollments.group_id, group.id)));
      expect(enrollRows).toHaveLength(2);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
