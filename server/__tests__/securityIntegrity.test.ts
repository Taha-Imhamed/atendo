import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import {
  audit_logs,
  courses,
  attendance_rounds,
  attendance_records,
  enrollments,
  groups,
  sessions,
  users,
  qr_tokens,
  fraud_signals,
} from "@shared/schema";
import { policyService } from "../services/policyService";
import { attendanceService } from "../services/attendanceService";
import { roundService } from "../services/roundService";
import { eq } from "drizzle-orm";

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

async function seedBasicSession() {
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

  const [student] = await db
    .insert(users)
    .values({
      email: `student-${Date.now()}@example.com`,
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
      code: `CS-${Date.now()}`,
      name: "Integrity",
      term: "Fall",
      device_binding_enabled: false,
    })
    .returning();

  const [group] = await db
    .insert(groups)
    .values({ course_id: course.id, name: "G1" })
    .returning();

  await db
    .insert(enrollments)
    .values({
      student_id: student.id,
      course_id: course.id,
      group_id: group.id,
    });

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

  const roundData = await roundService.createRound(session.id);

  return { professor, student, course, group, session, round: roundData.round, token: roundData.token };
}

describe("Security & Integrity", () => {
  beforeEach(resetDb);

  it("writes audit log on policy creation", async () => {
    await policyService.createPolicy({
      scopeType: "global",
      rules: {
        lateAfterMinutes: { first_hour: 21, break: 11 },
        graceMinutes: 0,
      },
    });

    const rows = await db.select().from(audit_logs);
    const hasPolicyCreate = rows.some((row) => row.action === "policy_create");
    expect(hasPolicyCreate).toBe(true);
  });

  it("emits multiple_device signal when fingerprints differ in same session", async () => {
    const seed = await seedBasicSession();
    await db
      .update(courses)
      .set({ device_binding_enabled: true })
      .where(eq(courses.id, seed.course.id));

    await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      seed.token.rawToken,
      null,
      "fp-1",
    );

    const round2 = await roundService.createRound(seed.session.id);
    await attendanceService.recordScan(
      seed.student.id,
      round2.round.id,
      round2.token.rawToken,
      null,
      "fp-2",
    );

    const signals = await db.select().from(fraud_signals);
    const hasMultiple = signals.some((s) => s.type === "multiple_device");
    expect(hasMultiple).toBe(true);
  });

  it("emits rapid_burst signal after 4 scans in 60s", async () => {
    const seed = await seedBasicSession();

    let currentRound = seed.round;
    let currentToken = seed.token;

    for (let i = 0; i < 4; i++) {
      await attendanceService.recordScan(
        seed.student.id,
        currentRound.id,
        currentToken.rawToken,
      );
      if (i < 3) {
        const next = await roundService.createRound(seed.session.id);
        currentRound = next.round;
        currentToken = next.token;
      }
    }

    const signals = await db.select().from(fraud_signals);
    const rapid = signals.filter((s) => s.type === "rapid_burst");
    expect(rapid.length).toBeGreaterThanOrEqual(1);
  });
});
