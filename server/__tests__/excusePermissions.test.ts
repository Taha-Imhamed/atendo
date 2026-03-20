import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/index";
import {
  attendance_rounds,
  courses,
  enrollments,
  excuse_requests,
  groups,
  sessions,
  users,
} from "@shared/schema";
import { excuseService } from "../services/excuseService";
import { and, eq } from "drizzle-orm";

async function resetDb() {
  await db.delete(excuse_requests);
  await db.delete(attendance_rounds);
  await db.delete(sessions);
  await db.delete(enrollments);
  await db.delete(groups);
  await db.delete(courses);
  await db.delete(users);
}

async function seedExcuse() {
  const [prof] = await db
    .insert(users)
    .values({
      email: "prof@test.com",
      username: "prof-test",
      display_name: "Prof",
      password: "hashed",
      role: "professor",
    })
    .returning();

  const [owner] = await db
    .insert(users)
    .values({
      email: "student1@test.com",
      username: "student1",
      display_name: "Student One",
      password: "hashed",
      role: "student",
    })
    .returning();

  const [otherStudent] = await db
    .insert(users)
    .values({
      email: "student2@test.com",
      username: "student2",
      display_name: "Student Two",
      password: "hashed",
      role: "student",
    })
    .returning();

  const [course] = await db
    .insert(courses)
    .values({
      professor_id: prof.id,
      code: "EX1",
      name: "Excuse Testing",
      term: "Spring",
    })
    .returning();

  const [group] = await db
    .insert(groups)
    .values({ course_id: course.id, name: "G1" })
    .returning();

  await db.insert(enrollments).values({
    student_id: owner.id,
    course_id: course.id,
    group_id: group.id,
  });

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

  const [round] = await db
    .insert(attendance_rounds)
    .values({
      session_id: session.id,
      round_number: 1,
      starts_at: new Date().toISOString(),
      is_active: true,
    })
    .returning();

  const [excuse] = await db
    .insert(excuse_requests)
    .values({
      round_id: round.id,
      student_id: owner.id,
      reason: "Medical",
      attachment_path: "/tmp/doctor-note.pdf",
      status: "PENDING",
    })
    .returning();

  return { prof, owner, otherStudent, excuse };
}

describe("excuseService.getAttachmentPathForAuthorizedUser", () => {
  beforeEach(resetDb);

  it("allows the submitting student", async () => {
    const { owner, excuse } = await seedExcuse();
    const path = await excuseService.getAttachmentPathForAuthorizedUser(
      owner.id,
      "student",
      excuse.id,
    );
    expect(path).toBe("/tmp/doctor-note.pdf");
  });

  it("blocks other students", async () => {
    const { otherStudent, excuse } = await seedExcuse();
    await expect(
      excuseService.getAttachmentPathForAuthorizedUser(
        otherStudent.id,
        "student",
        excuse.id,
      ),
    ).rejects.toThrowError();
  });

  it("allows the owning professor", async () => {
    const { prof, excuse } = await seedExcuse();
    const path = await excuseService.getAttachmentPathForAuthorizedUser(
      prof.id,
      "professor",
      excuse.id,
    );
    expect(path).toContain("doctor-note.pdf");
  });
});
