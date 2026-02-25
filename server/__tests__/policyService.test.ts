import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import {
  attendance_policies,
  attendance_policy_history,
  course_policy_assignments,
  courses,
  users,
  audit_logs,
  fraud_signals,
} from "@shared/schema";
import { policyService } from "../services/policyService";

async function resetDb() {
  await db.delete(fraud_signals);
  await db.delete(audit_logs);
  await db.delete(course_policy_assignments);
  await db.delete(attendance_policy_history);
  await db.delete(attendance_policies);
  await db.delete(courses);
  await db.delete(users);
}

async function seedProfessorAndCourse() {
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
      code: `CS-${Date.now()}`,
      name: "Policy Test",
      term: "Spring",
    })
    .returning();

  return { professor, course };
}

describe("policyService.getActivePolicyForRound", () => {
  beforeEach(resetDb);

  it("falls back course -> faculty -> global", async () => {
    const { professor, course } = await seedProfessorAndCourse();

    const globalPolicy = await policyService.getActivePolicyForRound(
      course.id,
      professor.id,
    );
    expect(globalPolicy.rules.lateAfterMinutes.first_hour).toBe(20);

    const facultyPolicy = await policyService.createPolicy({
      scopeType: "faculty",
      scopeId: professor.id,
      rules: {
        lateAfterMinutes: { first_hour: 15, break: 8 },
        graceMinutes: 0,
      },
    });

    const facultyResult = await policyService.getActivePolicyForRound(
      course.id,
      professor.id,
    );
    expect(facultyResult.id).toBe(facultyPolicy.id);

    const coursePolicy = await policyService.createPolicy({
      scopeType: "course",
      scopeId: course.id,
      rules: {
        lateAfterMinutes: { first_hour: 12, break: 6 },
        graceMinutes: 1,
      },
    });
    await policyService.assignPolicyToCourse(coursePolicy.id, course.id);

    const courseResult = await policyService.getActivePolicyForRound(
      course.id,
      professor.id,
    );
    expect(courseResult.id).toBe(coursePolicy.id);
    expect(courseResult.rules.lateAfterMinutes.first_hour).toBe(12);
  });

  it("selects the highest active version for a scope", async () => {
    const { professor } = await seedProfessorAndCourse();

    const v1 = await policyService.createPolicy({
      scopeType: "faculty",
      scopeId: professor.id,
      rules: {
        lateAfterMinutes: { first_hour: 22, break: 11 },
        graceMinutes: 0,
      },
    });

    const v2 = await policyService.createPolicy({
      scopeType: "faculty",
      scopeId: professor.id,
      rules: {
        lateAfterMinutes: { first_hour: 18, break: 9 },
        graceMinutes: 2,
      },
    });

    const result = await policyService.getActivePolicyForRound(undefined, professor.id);
    expect(result.id).toBe(v2.id);
    expect(result.version).toBe(v2.version);
    expect(result.rules.lateAfterMinutes.first_hour).toBe(18);
  });
});
