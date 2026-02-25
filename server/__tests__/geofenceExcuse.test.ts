import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  attendance_records,
  attendance_rounds,
  courses,
  enrollments,
  groups,
  sessions,
  users,
  qr_tokens,
  excuse_requests,
  audit_logs,
  fraud_signals,
} from "@shared/schema";
import { attendanceService } from "../services/attendanceService";
import { roundService } from "../services/roundService";
import { excuseService } from "../services/excuseService";
import { ApiError } from "../errors/apiError";
import { qrService } from "../services/qrService";

async function resetDb() {
  await db.delete(fraud_signals);
  await db.delete(audit_logs);
  await db.delete(excuse_requests);
  await db.delete(qr_tokens);
  await db.delete(attendance_records);
  await db.delete(attendance_rounds);
  await db.delete(sessions);
  await db.delete(enrollments);
  await db.delete(groups);
  await db.delete(courses);
  await db.delete(users);
}

async function seedSession() {
  const [professor] = await db
    .insert(users)
    .values({
      email: "prof@example.com",
      username: `prof-${Date.now()}`,
      display_name: "Prof",
      password: "hashed",
      role: "professor",
    })
    .returning();

  const [student] = await db
    .insert(users)
    .values({
      email: "student@example.com",
      username: `student-${Date.now()}`,
      display_name: "Student",
      password: "hashed",
      role: "student",
    })
    .returning();

  const [course] = await db
    .insert(courses)
    .values({
      professor_id: professor.id,
      code: "GEOTEST",
      name: "Geofence",
      term: "Spring",
    })
    .returning();

  const [group] = await db
    .insert(groups)
    .values({
      course_id: course.id,
      name: "Group A",
    })
    .returning();

  await db
    .insert(enrollments)
    .values({
      student_id: student.id,
      course_id: course.id,
      group_id: group.id,
    })
    .returning();

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

  return { professor, student, session, course, group };
}

describe("geofence validation", () => {
  beforeEach(resetDb);

  it("accepts scans within geofence and rejects outside", async () => {
    const seed = await seedSession();
    const { round, token } = await roundService.createRound(seed.session.id, {
      geofenceEnabled: true,
      latitude: 40.0,
      longitude: -74.0,
      geofenceRadiusM: 150,
    });

    await attendanceService.recordScan(
      seed.student.id,
      round.id,
      token.rawToken,
      { latitude: 40.0005, longitude: -74.0005 },
    );

    const [student2] = await db
      .insert(users)
      .values({
        email: "student2@example.com",
        username: `student2-${Date.now()}`,
        display_name: "Student2",
        password: "hashed",
        role: "student",
      })
      .returning();

    await db
      .insert(enrollments)
      .values({
        student_id: student2.id,
        course_id: seed.course.id,
        group_id: seed.group.id,
      })
      .returning();

    const outsideToken = await qrService.generateToken(round.id);

    await expect(
      attendanceService.recordScan(
        student2.id,
        round.id,
        outsideToken.rawToken,
        { latitude: 41, longitude: -75 },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("excuse workflow", () => {
  beforeEach(resetDb);

  it("approves excuse and marks attendance as excused", async () => {
    const seed = await seedSession();
    const { round } = await roundService.createRound(seed.session.id);

    const excuse = await excuseService.submitExcuse(seed.student.id, {
      roundId: round.id,
      reason: "Medical appointment",
      category: "absence",
    });

    const tokensBefore = await db
      .select()
      .from(qr_tokens)
      .where(eq(qr_tokens.round_id, round.id));
    expect(tokensBefore.length).toBeGreaterThan(0);

    try {
      const updated = await excuseService.reviewExcuse(
        seed.professor.id,
        excuse.id,
        "approve",
      );

      expect(updated.status).toBe("APPROVED");
    } catch (error) {
      const roundExists = await db
        .select()
        .from(attendance_rounds)
        .where(eq(attendance_rounds.id, round.id));
      const studentExists = await db
        .select()
        .from(users)
        .where(eq(users.id, seed.student.id));
      const tokensAfter = await db
        .select()
        .from(qr_tokens)
        .where(eq(qr_tokens.round_id, round.id));
      const fk = await db.execute(sql`PRAGMA foreign_key_check;`);
      console.error("debug round", roundExists.length, "student", studentExists.length, "tokens", tokensAfter.length, "fk", fk);
      throw error;
    }

    const [record] = await db
      .select()
      .from(attendance_records)
      .where(eq(attendance_records.round_id, round.id))
      .limit(1);

    expect(record?.status).toBe("excused");
  });
});
