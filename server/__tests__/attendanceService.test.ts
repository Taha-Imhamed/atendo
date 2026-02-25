import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  attendance_records,
  attendance_rounds,
  attendance_policies,
  attendance_policy_history,
  course_policy_assignments,
  audit_logs,
  fraud_signals,
  courses,
  enrollments,
  groups,
  qr_tokens,
  sessions,
  users,
} from "@shared/schema";
import { attendanceService } from "../services/attendanceService";
import { roundService } from "../services/roundService";
import { qrService } from "../services/qrService";
import { ApiError } from "../errors/apiError";
import { policyService } from "../services/policyService";

async function resetDb() {
  await db.delete(fraud_signals);
  await db.delete(audit_logs);
  await db.delete(course_policy_assignments);
  await db.delete(attendance_policy_history);
  await db.delete(attendance_policies);
  await db.delete(attendance_records);
  await db.delete(qr_tokens);
  await db.delete(attendance_rounds);
  await db.delete(sessions);
  await db.delete(enrollments);
  await db.delete(groups);
  await db.delete(courses);
  await db.delete(users);
}

async function seedRound() {
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
      code: "CS-101",
      name: "Intro",
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

  const { round, token } = await roundService.createRound(session.id);

  return { professor, student, course, group, session, round, token };
}

describe("attendanceService.recordScan", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("records attendance and rotates QR token", async () => {
    const seed = await seedRound();
    const result = await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      seed.token.rawToken,
    );

    expect(result.roundId).toBe(seed.round.id);

    const [tokenRow] = await db
      .select()
      .from(qr_tokens)
      .where(eq(qr_tokens.id, seed.token.id));

    expect(tokenRow.consumed).toBe(true);

    const records = await db
      .select()
      .from(attendance_records)
      .where(eq(attendance_records.round_id, seed.round.id));
    expect(records).toHaveLength(1);
    expect(records[0].student_id).toBe(seed.student.id);

    const tokensForRound = await db
      .select()
      .from(qr_tokens)
      .where(eq(qr_tokens.round_id, seed.round.id));
    expect(tokensForRound.length).toBeGreaterThanOrEqual(2);
  });

  it("prevents duplicate scans for the same student", async () => {
    const seed = await seedRound();
    await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      seed.token.rawToken,
    );

    await expect(
      attendanceService.recordScan(
        seed.student.id,
        seed.round.id,
        seed.token.rawToken,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("qrService.validateAndConsumeToken", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("consumes a token once and rejects reuse", async () => {
    const seed = await seedRound();

    const firstUse = await qrService.validateAndConsumeToken(
      seed.round.id,
      seed.token.rawToken,
    );
    expect(firstUse.consumed).toBe(true);

    await expect(
      qrService.validateAndConsumeToken(seed.round.id, seed.token.rawToken),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects expired tokens", async () => {
    const seed = await seedRound();
    const expiredAt = new Date(Date.now() - 5_000).toISOString();
    await db
      .update(qr_tokens)
      .set({ expires_at: expiredAt })
      .where(eq(qr_tokens.id, seed.token.id));

    await expect(
      qrService.validateAndConsumeToken(seed.round.id, seed.token.rawToken),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("lateness thresholds", () => {
  beforeEach(resetDb);

  it("marks late after 20 minutes for first-hour rounds", async () => {
    const seed = await seedRound();
    const twentyOneMinutesAgo = new Date(Date.now() - 21 * 60 * 1000).toISOString();
    await db
      .update(attendance_rounds)
      .set({ starts_at: twentyOneMinutesAgo, is_break_round: false })
      .where(eq(attendance_rounds.id, seed.round.id));

    const token = await qrService.generateToken(seed.round.id);
    const result = await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      token.rawToken,
    );
    expect(result.status).toBe("late");
  });

  it("does not mark late at exactly 20 minutes for first-hour rounds", async () => {
    const seed = await seedRound();
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await db
      .update(attendance_rounds)
      .set({ starts_at: twentyMinutesAgo, is_break_round: false })
      .where(eq(attendance_rounds.id, seed.round.id));

    const token = await qrService.generateToken(seed.round.id);
    const result = await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      token.rawToken,
    );
    expect(result.status).toBe("on_time");
  });

  it("marks late after 10 minutes for break rounds", async () => {
    const seed = await seedRound();
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    await db
      .update(attendance_rounds)
      .set({ starts_at: elevenMinutesAgo, is_break_round: true })
      .where(eq(attendance_rounds.id, seed.round.id));

    const token = await qrService.generateToken(seed.round.id);
    const result = await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      token.rawToken,
    );
    expect(result.status).toBe("late");
  });

  it("on-time at exactly 10 minutes for break rounds", async () => {
    const seed = await seedRound();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await db
      .update(attendance_rounds)
      .set({ starts_at: tenMinutesAgo, is_break_round: true })
      .where(eq(attendance_rounds.id, seed.round.id));

    const token = await qrService.generateToken(seed.round.id);
    const result = await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      token.rawToken,
    );
    expect(result.status).toBe("on_time");
  });

  it("applies course policy overrides with grace minutes", async () => {
    const seed = await seedRound();
    const coursePolicy = await policyService.createPolicy({
      scopeType: "course",
      scopeId: seed.course.id,
      rules: {
        lateAfterMinutes: { first_hour: 5, break: 3 },
        graceMinutes: 2,
      },
    });
    await policyService.assignPolicyToCourse(coursePolicy.id, seed.course.id);

    const twelveMinutesAgo = new Date(Date.now() - 12 * 60 * 1000).toISOString();
    await db
      .update(attendance_rounds)
      .set({ starts_at: twelveMinutesAgo, is_break_round: false })
      .where(eq(attendance_rounds.id, seed.round.id));

    const token = await qrService.generateToken(seed.round.id);
    const result = await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      token.rawToken,
    );

    expect(result.status).toBe("late");
  });

  it("respects grace boundary at exact threshold for course policy", async () => {
    const seed = await seedRound();
    const coursePolicy = await policyService.createPolicy({
      scopeType: "course",
      scopeId: seed.course.id,
      rules: {
        lateAfterMinutes: { first_hour: 5, break: 3 },
        graceMinutes: 2,
      },
    });
    await policyService.assignPolicyToCourse(coursePolicy.id, seed.course.id);

    const sevenMinutesAgo = new Date(Date.now() - 7 * 60 * 1000).toISOString();
    await db
      .update(attendance_rounds)
      .set({ starts_at: sevenMinutesAgo, is_break_round: false })
      .where(eq(attendance_rounds.id, seed.round.id));

    const token = await qrService.generateToken(seed.round.id);
    const result = await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      token.rawToken,
    );

    expect(result.status).toBe("on_time");
  });

  it("stores offlineCapturedAt but uses server clock for lateness", async () => {
    const seed = await seedRound();
    const twentyFiveMinutesAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    await db
      .update(attendance_rounds)
      .set({ starts_at: twentyFiveMinutesAgo, is_break_round: false })
      .where(eq(attendance_rounds.id, seed.round.id));

    const token = await qrService.generateToken(seed.round.id);
    const offlineCapturedAt = new Date(Date.now() - 24 * 60 * 1000).toISOString();
    const result = await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      token.rawToken,
      null,
      null,
      null,
      offlineCapturedAt,
    );

    expect(result.status).toBe("late");
    const [record] = await db.select().from(attendance_records).where(
      eq(attendance_records.round_id, seed.round.id),
    );
    expect(record.recorded_at_client).toBe(offlineCapturedAt);
  });

  it("rejects duplicate client_scan_id", async () => {
    const seed = await seedRound();
    const token = await qrService.generateToken(seed.round.id);
    const clientId = "client-123";
    await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      token.rawToken,
      null,
      null,
      clientId,
    );

    const token2 = await qrService.generateToken(seed.round.id);
    await expect(
      attendanceService.recordScan(
        seed.student.id,
        seed.round.id,
        token2.rawToken,
        null,
        null,
        clientId,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("deduplicates offline sync attempts by client_scan_id", async () => {
    const seed = await seedRound();
    const offlineId = "offline-sync-1";

    const token1 = await qrService.generateToken(seed.round.id);
    await attendanceService.recordScan(
      seed.student.id,
      seed.round.id,
      token1.rawToken,
      null,
      null,
      offlineId,
      new Date().toISOString(),
    );

    const token2 = await qrService.generateToken(seed.round.id);
    await expect(
      attendanceService.recordScan(
        seed.student.id,
        seed.round.id,
        token2.rawToken,
        null,
        null,
        offlineId,
        new Date().toISOString(),
      ),
    ).rejects.toBeInstanceOf(ApiError);

    const rows = await db
      .select()
      .from(attendance_records)
      .where(eq(attendance_records.round_id, seed.round.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].client_scan_id).toBe(offlineId);
  });

  it("rejects expired tokens even with offlineCapturedAt", async () => {
    const seed = await seedRound();
    const token = await qrService.generateToken(seed.round.id);
    const expiredAt = new Date(Date.now() - 5_000).toISOString();
    await db
      .update(qr_tokens)
      .set({ expires_at: expiredAt })
      .where(eq(qr_tokens.id, token.id));

    await expect(
      attendanceService.recordScan(
        seed.student.id,
        seed.round.id,
        token.rawToken,
        null,
        null,
        randomUUID(),
        new Date().toISOString(),
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
