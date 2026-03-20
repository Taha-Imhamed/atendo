import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db/index";
import {
  audit_logs,
  fraud_signals,
  users,
  courses,
  groups,
  sessions,
} from "@shared/schema";
import { fraudService } from "../services/fraudService";
import { auditService } from "../services/auditService";

async function resetDb() {
  await db.delete(fraud_signals);
  await db.delete(audit_logs);
  await db.delete(sessions);
  await db.delete(groups);
  await db.delete(courses);
  await db.delete(users);
}

async function seedUser(role: "student" | "professor") {
  const [user] = await db
    .insert(users)
    .values({
      email: `${role}-${Date.now()}@example.com`,
      username: `${role}-${Date.now()}`,
      display_name: `${role} demo`,
      password: "hashed",
      role,
    })
    .returning();
  return user;
}

describe("fraudService.emit", () => {
  beforeEach(resetDb);

  it("persists rapid_burst signal with details", async () => {
    const student = await seedUser("student");
    const prof = await seedUser("professor");
    const [course] = await db
      .insert(courses)
      .values({
        professor_id: prof.id,
        code: "X1",
        name: "Test",
        term: "Now",
      })
      .returning();
    const [group] = await db
      .insert(groups)
      .values({ course_id: course.id, name: "G1" })
      .returning();
    const [session] = await db
      .insert(sessions)
      .values({
        group_id: group.id,
        course_id: course.id,
        professor_id: prof.id,
        starts_at: new Date().toISOString(),
        is_active: true,
        status: "active",
      })
      .returning();

    await fraudService.emit({
      type: "rapid_burst",
      severity: "high",
      sessionId: session.id,
      studentId: student.id,
      details: { windowSeconds: 60, priorCount: 3 },
    });

    const rows = await db.select().from(fraud_signals);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("rapid_burst");
    expect(rows[0].session_id).toBe(session.id);
    expect(rows[0].student_id).toBe(student.id);
  });
});

describe("auditService.log", () => {
  beforeEach(resetDb);

  it("stores before/after payloads for session lifecycle", async () => {
    const prof = await seedUser("professor");
    const snapshot = { is_active: true, status: "active" };

    await auditService.log({
      actorId: prof.id,
      action: "session_create",
      entityType: "session",
      entityId: "session-1",
      before: null,
      after: snapshot,
      reason: "seed",
    });

    const [row] = await db.select().from(audit_logs);
    expect(row.action).toBe("session_create");
    expect(row.entity_id).toBe("session-1");
    expect(row.before_json).toBeNull();
    expect(row.after_json).toContain("\"is_active\":true");
    expect(row.actor_id).toBe(prof.id);
  });
});
