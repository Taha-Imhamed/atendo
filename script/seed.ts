import "dotenv/config";
import { randomBytes, scryptSync, createHash } from "crypto";
import { db } from "../server/db/index";
import {
  audit_logs,
  attendance_records,
  attendance_rounds,
  courses,
  enrollments,
  groups,
  qr_tokens,
  sessions,
  users,
  fraud_signals,
} from "@shared/schema";
import { logger } from "../server/utils/logger";

const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

logger.warn("WARNING: This seeding script is intended for demo or development environments only. Running this script will delete existing data.");

async function reset() {
  // Delete in dependency order to avoid FK errors.
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

async function createUser(params: {
  role: "professor" | "student";
  email: string;
  username: string;
  display_name: string;
  password: string;
}) {
  const [user] = await db
    .insert(users)
    .values({
      role: params.role,
      email: params.email,
      username: params.username,
      display_name: params.display_name,
      password: hashPassword(params.password),
    })
    .returning();
  return user;
}

async function createCourse(params: {
  professorId: string;
  code: string;
  name: string;
  term: string;
  description?: string | null;
  deviceBinding?: boolean;
}) {
  const [course] = await db
    .insert(courses)
    .values({
      professor_id: params.professorId,
      code: params.code,
      name: params.name,
      term: params.term,
      description: params.description ?? null,
      device_binding_enabled: params.deviceBinding ?? false,
    })
    .returning();
  return course;
}

async function createGroup(courseId: string, name: string, meeting: string | null) {
  const [group] = await db
    .insert(groups)
    .values({
      course_id: courseId,
      name,
      meeting_schedule: meeting,
    })
    .returning();
  return group;
}

async function enroll(studentId: string, courseId: string, groupId: string) {
  await db.insert(enrollments).values({
    student_id: studentId,
    course_id: courseId,
    group_id: groupId,
  });
}

async function createSession(groupId: string, courseId: string, professorId: string, startsAt: string) {
  const [session] = await db
    .insert(sessions)
    .values({
      group_id: groupId,
      course_id: courseId,
      professor_id: professorId,
      starts_at: startsAt,
      is_active: true,
      status: "active",
      created_at: startsAt,
    })
    .returning();
  return session;
}

async function createRound(sessionId: string, roundNumber: number, startsAt: string, options?: { geofence?: boolean }) {
  const [round] = await db
    .insert(attendance_rounds)
    .values({
      session_id: sessionId,
      round_number: roundNumber,
      starts_at: startsAt,
      is_active: true,
      geofence_enabled: options?.geofence ?? false,
      geofence_radius_m: options?.geofence ? 75 : null,
      latitude: options?.geofence ? 37.7749 : null,
      longitude: options?.geofence ? -122.4194 : null,
      is_break_round: roundNumber > 1,
      created_at: startsAt,
    })
    .returning();
  return round;
}

async function createToken(roundId: string, expiresAt: string, createdAt: string) {
  const raw = randomBytes(24).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const [token] = await db
    .insert(qr_tokens)
    .values({
      round_id: roundId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      consumed: false,
      created_at: createdAt,
    })
    .returning();
  return { token, raw };
}

async function createAttendance(params: {
  roundId: string;
  studentId: string;
  status: "on_time" | "late" | "excused";
  recordedAt: string;
  deviceFingerprint?: string | null;
  lat?: number | null;
  lng?: number | null;
  clientScanId?: string | null;
  recordedAtClient?: string | null;
  qrTokenId?: string | null;
}) {
  await db.insert(attendance_records).values({
    round_id: params.roundId,
    student_id: params.studentId,
    status: params.status,
    recorded_at: params.recordedAt,
    device_fingerprint: params.deviceFingerprint ?? null,
    recorded_latitude: params.lat ?? null,
    recorded_longitude: params.lng ?? null,
    client_scan_id: params.clientScanId ?? null,
    recorded_at_client: params.recordedAtClient ?? null,
    qr_token_id: params.qrTokenId ?? null,
  });
}

async function runSeed() {
  await reset();
  const now = new Date();
  const iso = (d: Date) => d.toISOString();

  const profAnas = await createUser({
    role: "professor",
    email: "prof-anas@example.com",
    username: "anas",
    display_name: "Anas",
    password: "0000",
  });
  const profMina = await createUser({
    role: "professor",
    email: "prof-mina@example.com",
    username: "prof-mina",
    display_name: "Professor Mina",
    password: "teacher123",
  });

  const students = [
    await createUser({
      role: "student",
      email: "student1@example.com",
      username: "alice",
      display_name: "Alice OnTime",
      password: "0000",
    }),
    await createUser({
      role: "student",
      email: "student2@example.com",
      username: "bob",
      display_name: "Bob Late",
      password: "0000",
    }),
    await createUser({
      role: "student",
      email: "student3@example.com",
      username: "carol",
      display_name: "Carol Offline",
      password: "0000",
    }),
    await createUser({
      role: "student",
      email: "student4@example.com",
      username: "dave",
      display_name: "Dave Duplicate",
      password: "0000",
    }),
    await createUser({
      role: "student",
      email: "anas@student.example.com",
      username: "anas-student",
      display_name: "Anas Student",
      password: "0000",
    }),
  ];

  const courseQr = await createCourse({
    professorId: profAnas.id,
    code: "QR101",
    name: "QR Attendance 101",
    term: "Spring 2026",
    description: "Device binding + geofence demos",
    deviceBinding: true,
  });

  const courseHist = await createCourse({
    professorId: profMina.id,
    code: "HIST201",
    name: "Modern History",
    term: "Spring 2026",
    description: "Standard attendance, no device binding",
    deviceBinding: false,
  });

  const groupA = await createGroup(courseQr.id, "Group A", "Mon/Wed 09:00");
  const groupB = await createGroup(courseQr.id, "Group B", "Tue/Thu 13:00");
  const groupC = await createGroup(courseHist.id, "Section 1", "Fri 10:00");

  await enroll(students[0].id, courseQr.id, groupA.id);
  await enroll(students[1].id, courseQr.id, groupA.id);
  await enroll(students[2].id, courseQr.id, groupB.id);
  await enroll(students[3].id, courseQr.id, groupB.id);
  await enroll(students[0].id, courseHist.id, groupC.id);
  await enroll(students[2].id, courseHist.id, groupC.id);

  const session1Start = iso(new Date(now.getTime() - 45 * 60 * 1000));
  const session2Start = iso(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));
  const session3Start = iso(new Date(now.getTime() - 90 * 60 * 1000));

  const sessionA1 = await createSession(groupA.id, courseQr.id, profAnas.id, session1Start);
  const sessionB1 = await createSession(groupB.id, courseQr.id, profAnas.id, session3Start);
  const sessionC1 = await createSession(groupC.id, courseHist.id, profMina.id, session2Start);

  const roundA1 = await createRound(sessionA1.id, 1, session1Start, { geofence: true });
  const roundA2 = await createRound(sessionA1.id, 2, iso(new Date(now.getTime() - 20 * 60 * 1000)), { geofence: true });

  const roundB1 = await createRound(sessionB1.id, 1, session3Start);
  const roundB2 = await createRound(sessionB1.id, 2, iso(new Date(now.getTime() - 70 * 60 * 1000)));

  const roundC1 = await createRound(sessionC1.id, 1, session2Start);
  const roundC2 = await createRound(sessionC1.id, 2, iso(new Date(new Date(session2Start).getTime() - 60 * 60 * 1000)));

  const tokenA1 = await createToken(roundA1.id, iso(new Date(now.getTime() + 15 * 60 * 1000)), session1Start);
  const tokenA2 = await createToken(roundA2.id, iso(new Date(now.getTime() + 5 * 60 * 1000)), session1Start);
  await createToken(roundB1.id, iso(new Date(now.getTime() + 10 * 60 * 1000)), session3Start);

  // Attendance states
  await createAttendance({
    roundId: roundA1.id,
    studentId: students[0].id,
    status: "on_time",
    recordedAt: iso(new Date(new Date(session1Start).getTime() + 2 * 60 * 1000)),
    deviceFingerprint: "fp-alice-1",
    lat: 37.7749,
    lng: -122.4194,
    qrTokenId: tokenA1.token.id,
    clientScanId: "alice-online-1",
  });

  await createAttendance({
    roundId: roundA1.id,
    studentId: students[1].id,
    status: "late",
    recordedAt: iso(new Date(new Date(session1Start).getTime() + 30 * 60 * 1000)),
    deviceFingerprint: "fp-bob-1",
    lat: 37.775,
    lng: -122.4195,
    recordedAtClient: iso(new Date(now.getTime() - 35 * 60 * 1000)),
    clientScanId: "bob-offline-1",
  });

  await createAttendance({
    roundId: roundA2.id,
    studentId: students[0].id,
    status: "on_time",
    recordedAt: iso(new Date(new Date(session1Start).getTime() + 25 * 60 * 1000)),
    deviceFingerprint: "fp-alice-2", // different device to trigger multiple_device signal
    clientScanId: "alice-online-2",
    qrTokenId: tokenA2.token.id,
  });

  await createAttendance({
    roundId: roundB1.id,
    studentId: students[2].id,
    status: "on_time",
    recordedAt: iso(new Date(new Date(session3Start).getTime() + 5 * 60 * 1000)),
    recordedAtClient: iso(new Date(new Date(session3Start).getTime() + 4 * 60 * 1000)),
    clientScanId: "carol-offline-1",
  });

  await createAttendance({
    roundId: roundB1.id,
    studentId: students[3].id,
    status: "on_time",
    recordedAt: iso(new Date(new Date(session3Start).getTime() + 6 * 60 * 1000)),
    deviceFingerprint: "fp-dave-1",
    clientScanId: "dave-online-1",
  });

  await createAttendance({
    roundId: roundC1.id,
    studentId: students[0].id,
    status: "on_time",
    recordedAt: iso(new Date(new Date(session2Start).getTime() + 10 * 60 * 1000)),
    clientScanId: "alice-hist-1",
  });

  await createAttendance({
    roundId: roundC2.id,
    studentId: students[2].id,
    status: "late",
    recordedAt: iso(new Date(new Date(session2Start).getTime() - 40 * 60 * 1000)),
    clientScanId: "carol-hist-1",
  });

  await db.insert(fraud_signals).values([
    {
      type: "rapid_burst",
      severity: "medium",
      session_id: sessionA1.id,
      round_id: roundA1.id,
      student_id: students[1].id,
      details_json: JSON.stringify({ windowSeconds: 60, priorCount: 3 }),
    },
    {
      type: "multiple_device",
      severity: "medium",
      session_id: sessionA1.id,
      round_id: roundA2.id,
      student_id: students[0].id,
      details_json: JSON.stringify({ fingerprintsSeen: 2 }),
    },
    {
      type: "gps_cluster",
      severity: "low",
      session_id: sessionB1.id,
      round_id: roundB1.id,
      student_id: students[3].id,
      details_json: JSON.stringify({ latitude: 37.7749, longitude: -122.4194 }),
    },
    {
      type: "edge_scan",
      severity: "low",
      session_id: sessionA1.id,
      round_id: roundA2.id,
      student_id: students[0].id,
      details_json: JSON.stringify({ deltaSeconds: 1200, thresholdSeconds: 1200 }),
    },
  ]);

  await db.insert(audit_logs).values([
    {
      actor_id: profAnas.id,
      action: "session_create",
      entity_type: "session",
      entity_id: sessionA1.id,
      after_json: JSON.stringify({ sessionA1 }),
    },
    {
      actor_id: profAnas.id,
      action: "round_create",
      entity_type: "attendance_round",
      entity_id: roundA1.id,
      after_json: JSON.stringify({ geofence_enabled: true }),
    },
    {
      actor_id: profMina.id,
      action: "policy_assign_course",
      entity_type: "course",
      entity_id: courseHist.id,
      reason: "Department standard",
    },
  ]);

  console.log("Seed complete");
  console.log("Professor IDs:", profAnas.id, profMina.id);
  console.log("Courses:", courseQr.code, courseHist.code);
  console.log("Sessions:", sessionA1.id, sessionB1.id, sessionC1.id);
}

runSeed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed", error);
    process.exit(1);
  });
