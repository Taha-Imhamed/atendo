import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { db as runtimeDb } from "../db";
import {
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
import { roundService } from "../services/roundService";
import { attendanceService } from "../services/attendanceService";
import { sessionService } from "../services/sessionService";

type SqliteTestDb = ReturnType<typeof drizzleSqlite>;
const db: SqliteTestDb = runtimeDb as unknown as SqliteTestDb;

async function resetDb() {
  await db.delete(fraud_signals);
  await db.delete(audit_logs);
  await db.delete(attendance_records);
  await db.delete(qr_tokens);
  await db.delete(attendance_rounds);
  await db.delete(sessions);
  await db.delete(enrollments);
  await db.delete(groups);
  await db.delete(courses);
  await db.delete(users);
}

describe("sessionService.getSessionExport", () => {
  beforeEach(resetDb);

  it("includes absent rows for enrolled students who missed a round", async () => {
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

    const [studentA] = await db
      .insert(users)
      .values({
        email: `stud-a-${Date.now()}@example.com`,
        username: `stud-a-${Date.now()}`,
        display_name: "Student A",
        password: "hashed",
        role: "student",
      })
      .returning();

    const [studentB] = await db
      .insert(users)
      .values({
        email: `stud-b-${Date.now()}@example.com`,
        username: `stud-b-${Date.now()}`,
        display_name: "Student B",
        password: "hashed",
        role: "student",
      })
      .returning();

    const [course] = await db
      .insert(courses)
      .values({
        professor_id: professor.id,
        code: "CS-EXP-1",
        name: "Export Course",
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

    await db.insert(enrollments).values([
      {
        student_id: studentA.id,
        course_id: course.id,
        group_id: group.id,
      },
      {
        student_id: studentB.id,
        course_id: course.id,
        group_id: group.id,
      },
    ]);

    const [session] = await db
      .insert(sessions)
      .values({
        group_id: group.id,
        course_id: course.id,
        professor_id: professor.id,
        starts_at: new Date().toISOString(),
        is_active: true,
        status: "active",
      })
      .returning();

    const { round, token } = await roundService.createRound(session.id);
    await attendanceService.recordScan(studentA.id, round.id, token.rawToken);

    const result = await sessionService.getSessionExport(professor.id, session.id);

    expect(result.records).toHaveLength(2);

    const studentARow = result.records.find(
      (row: (typeof result.records)[number]) => row.studentUsername === studentA.username,
    );
    const studentBRow = result.records.find(
      (row: (typeof result.records)[number]) => row.studentUsername === studentB.username,
    );

    expect(studentARow?.status).toBe("on_time");
    expect(studentARow?.recordedAt).toBeTruthy();

    expect(studentBRow?.status).toBe("absent");
    expect(studentBRow?.recordedAt).toBeNull();
  });
});
