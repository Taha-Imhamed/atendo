import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db";
import {
  attendance_records,
  attendance_rounds,
  enrollments,
  sessions,
  groups,
  courses,
} from "@shared/schema";
import { ApiError } from "../errors/apiError";
import { buildQrPayload, qrService } from "./qrService";
import { emitRoundQrUpdated } from "../websocket/manager";
import { logger } from "../utils/logger";
import type { AttendanceRound, Session } from "@shared/schema";
import { haversineDistanceMeters } from "../utils/geo";
import { policyService } from "./policyService";
import { fraudService } from "./fraudService";
import { auditService } from "./auditService";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

async function requireActiveRound(
  executor: DbExecutor,
  roundId: string,
): Promise<AttendanceRound> {
  const [round] = await executor
    .select()
    .from(attendance_rounds)
    .where(
      and(eq(attendance_rounds.id, roundId), eq(attendance_rounds.is_active, true)),
    )
    .limit(1);

  if (!round) {
    throw new ApiError(404, "Round not active");
  }

  return round;
}

async function requireActiveSession(
  executor: DbExecutor,
  sessionId: string,
): Promise<Session> {
  const [session] = await executor
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session || !session.is_active) {
    throw new ApiError(400, "Session is not active");
  }

  return session;
}

async function ensureStudentEnrollment(
  executor: DbExecutor,
  studentId: string,
  groupId: string,
) {
  const [enrollment] = await executor
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.student_id, studentId),
        eq(enrollments.group_id, groupId),
      ),
    )
    .limit(1);

  if (!enrollment) {
    throw new ApiError(403, "Student not enrolled in this group");
  }
}

async function ensureNotAlreadyRecorded(
  executor: DbExecutor,
  roundId: string,
  studentId: string,
) {
  const existing = await executor
    .select()
    .from(attendance_records)
    .where(
      and(
        eq(attendance_records.round_id, roundId),
        eq(attendance_records.student_id, studentId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ApiError(409, "Attendance already recorded for this round");
  }
}

async function detectRapidBurst(
  studentId: string,
  sessionId: string,
  windowStartIso: string,
) {
  const [{ count }] = await db
    .select({
      count: sql<number>`COUNT(${attendance_records.id})`,
    })
    .from(attendance_records)
    .innerJoin(
      attendance_rounds,
      eq(attendance_records.round_id, attendance_rounds.id),
    )
    .where(
      and(
        eq(attendance_rounds.session_id, sessionId),
        eq(attendance_records.student_id, studentId),
        sql`${attendance_records.recorded_at} >= ${windowStartIso}`,
      ),
    );

  if ((count ?? 0) >= 3) {
    await fraudService.emit({
      type: "rapid_burst",
      severity: "medium",
      sessionId,
      studentId,
      details: { windowSeconds: 60, priorCount: count },
    });
  }
}

async function detectGpsCluster(
  studentId: string,
  sessionId: string,
  roundId: string,
  lat?: number | null,
  lng?: number | null,
  nowIso?: string,
) {
  if (lat == null || lng == null || !nowIso) return;
  const roundedLat = Number(lat.toFixed(4));
  const roundedLng = Number(lng.toFixed(4));
  const windowIso = new Date(Date.parse(nowIso) - 120_000).toISOString();
  const [{ count }] = await db
    .select({
      count: sql<number>`COUNT(${attendance_records.id})`,
    })
    .from(attendance_records)
    .innerJoin(
      attendance_rounds,
      eq(attendance_records.round_id, attendance_rounds.id),
    )
    .where(
      and(
        eq(attendance_rounds.session_id, sessionId),
        sql`${attendance_records.recorded_at} >= ${windowIso}`,
        sql`${attendance_records.recorded_latitude} BETWEEN ${roundedLat - 0.0001} AND ${
          roundedLat + 0.0001
        }`,
        sql`${attendance_records.recorded_longitude} BETWEEN ${roundedLng - 0.0001} AND ${
          roundedLng + 0.0001
        }`,
        sql`${attendance_records.student_id} != ${studentId}`,
      ),
    );

  if ((count ?? 0) >= 1) {
    await fraudService.emit({
      type: "gps_cluster",
      severity: "low",
      sessionId,
      roundId,
      studentId,
      details: { latitude: roundedLat, longitude: roundedLng, withinSeconds: 120 },
    });
  }
}

async function detectEdgeScans(
  studentId: string,
  sessionId: string,
  roundId: string,
  deltaSeconds: number,
  thresholdSeconds: number,
) {
  const distance = Math.abs(deltaSeconds - thresholdSeconds);
  if (distance > 15) return;
  await fraudService.emit({
    type: "edge_scan",
    severity: "low",
    sessionId,
    roundId,
    studentId,
    details: { deltaSeconds, thresholdSeconds },
  });
}

async function detectMultipleDevices(
  studentId: string,
  sessionId: string,
  courseId: string,
  deviceFingerprint?: string | null,
) {
  if (!deviceFingerprint) return;
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!course || !course.device_binding_enabled) return;

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(${attendance_records.id})` })
    .from(attendance_records)
    .innerJoin(
      attendance_rounds,
      eq(attendance_records.round_id, attendance_rounds.id),
    )
    .where(
      and(
        eq(attendance_rounds.session_id, sessionId),
        eq(attendance_records.student_id, studentId),
        sql`${attendance_records.device_fingerprint} IS NOT NULL`,
        sql`${attendance_records.device_fingerprint} != ${deviceFingerprint}`,
      ),
    );

  if ((count ?? 0) > 0) {
    await fraudService.emit({
      type: "multiple_device",
      severity: "medium",
      sessionId,
      studentId,
      details: { fingerprintsSeen: count + 1 },
    });
  }
}

export const attendanceService = {
  /**
   * Record a student's scan for a round, consuming the QR token and rotating the next one.
   */
  async recordScan(
    studentId: string,
    roundId: string,
    token: string,
    location?: { latitude: number; longitude: number } | null,
    deviceFingerprint?: string | null,
    clientScanId?: string | null,
    offlineCapturedAt?: string | null,
  ) {
    const round = await requireActiveRound(db, roundId);
    const session = await requireActiveSession(db, round.session_id);
    await ensureStudentEnrollment(db, studentId, session.group_id);
    await ensureNotAlreadyRecorded(db, roundId, studentId);

    if (round.geofence_enabled) {
      if (
        !location ||
        location.latitude === undefined ||
        location.longitude === undefined
      ) {
        logger.warn("scan rejected: missing location", { roundId, userId: studentId });
        throw new ApiError(400, "Location required for this round.");
      }
      if (
        round.latitude == null ||
        round.longitude == null ||
        !round.geofence_radius_m
      ) {
        logger.error("geofence misconfiguration", { roundId });
        throw new ApiError(500, "Geofence configuration missing for this round.");
      }
      const distance = haversineDistanceMeters(
        round.latitude,
        round.longitude,
        location.latitude,
        location.longitude,
      );
      if (distance > round.geofence_radius_m) {
        logger.warn("scan rejected: outside geofence", {
          roundId,
          userId: studentId,
          distance: Math.round(distance),
        });
        throw new ApiError(403, "You are outside the allowed scan area.");
      }
    }

    const tokenEntry = await qrService.validateAndConsumeToken(
      roundId,
      token,
      db,
    );
    const nowMs = Date.now();
    const recordedAt = new Date(nowMs).toISOString();

    const roundStartMs = round.starts_at
      ? new Date(round.starts_at).getTime()
      : nowMs;
    const policy = await policyService.getActivePolicyForRound(
      session.course_id,
      session.professor_id,
    );
    const graceMinutes = policy.rules.graceMinutes ?? 0;
    const lateAfterMinutes = round.is_break_round
      ? policy.rules.lateAfterMinutes.break
      : policy.rules.lateAfterMinutes.first_hour;
    const thresholdSeconds = Math.floor((lateAfterMinutes + graceMinutes) * 60);
    const nowSeconds = Math.floor(nowMs / 1000);
    const startSeconds = Math.floor(roundStartMs / 1000);
    const deltaSeconds = nowSeconds - startSeconds;
    const isLate = deltaSeconds > thresholdSeconds;

    try {
      await db.insert(attendance_records).values({
        round_id: roundId,
        student_id: studentId,
        qr_token_id: tokenEntry.id,
        status: isLate ? "late" : "on_time",
        recorded_at: recordedAt,
        device_fingerprint: deviceFingerprint ?? null,
        recorded_latitude: location?.latitude ?? null,
        recorded_longitude: location?.longitude ?? null,
        client_scan_id: clientScanId ?? null,
        recorded_at_client: offlineCapturedAt ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("attendance_records_round_student_unique")) {
        throw new ApiError(409, "Attendance already recorded for this round");
      }
      if (message.includes("attendance_records_round_student_client_unique")) {
        throw new ApiError(409, "Duplicate offline scan");
      }
      throw error;
    }

    const windowStartIso = new Date(nowMs - 60_000).toISOString();
    await detectRapidBurst(studentId, session.id, windowStartIso);
    await detectGpsCluster(
      studentId,
      session.id,
      roundId,
      location?.latitude ?? null,
      location?.longitude ?? null,
      recordedAt,
    );
    await detectEdgeScans(studentId, session.id, roundId, deltaSeconds, thresholdSeconds);
    await detectMultipleDevices(studentId, session.id, session.course_id, deviceFingerprint);

    const nextToken = await qrService.generateToken(roundId, db);
    const qrPayload = buildQrPayload({
      roundId,
      token: nextToken.rawToken,
      sessionId: session.id,
      courseId: session.course_id,
      groupId: session.group_id,
      geofenceEnabled: round.geofence_enabled,
      geofenceRadiusM: round.geofence_radius_m,
      latitude: round.latitude,
      longitude: round.longitude,
      isBreakRound: round.is_break_round,
    });

    emitRoundQrUpdated(session.id, {
      sessionId: session.id,
      roundId,
      token: nextToken.rawToken,
      expiresAt: nextToken.expiresAt.toISOString(),
      qrPayload,
    });

    const status = isLate ? "late" : "on_time";

    logger.info("attendance recorded", {
      userId: studentId,
      roundId,
      status,
    });

    return {
      roundId,
      recordedAt,
      status,
    };
  },

  /**
   * Aggregated attendance summaries for the requesting student.
   */
  async getMyAttendance(studentId: string) {
    const stats = await db
      .select({
        courseId: courses.id,
        courseName: courses.name,
        groupName: groups.name,
        totalRounds: sql<number>`(
          SELECT COUNT(*)
          FROM ${attendance_rounds} ar
          JOIN ${sessions} s ON ar.session_id = s.id
          WHERE s.group_id = ${groups.id}
        )`,
        attendedRounds: sql<number>`(
          SELECT COUNT(*)
          FROM ${attendance_records} rec
          JOIN ${attendance_rounds} ar ON rec.round_id = ar.id
          JOIN ${sessions} s ON ar.session_id = s.id
          WHERE rec.student_id = ${studentId} AND s.group_id = ${groups.id}
        )`,
      })
      .from(enrollments)
      .innerJoin(groups, eq(enrollments.group_id, groups.id))
      .innerJoin(courses, eq(enrollments.course_id, courses.id))
      .where(eq(enrollments.student_id, studentId));

    return stats.map((row) => ({
      courseId: row.courseId,
      courseName: row.courseName,
      groupName: row.groupName,
      totalRounds: Number(row.totalRounds ?? 0),
      attendedRounds: Number(row.attendedRounds ?? 0),
      attendancePercentage:
        Number(row.totalRounds ?? 0) === 0
          ? 0
          : Math.round(
              (Number(row.attendedRounds ?? 0) / Number(row.totalRounds ?? 0)) *
                100,
            ),
    }));
  },

  /**
   * Returns detailed attendance records for a student ordered by recency.
   */
  async getAttendanceHistory(studentId: string) {
    const rows = await db
      .select({
        recordId: attendance_records.id,
        recordedAt: attendance_records.recorded_at,
        status: attendance_records.status,
        roundId: attendance_records.round_id,
        sessionId: attendance_rounds.session_id,
        courseId: courses.id,
        courseName: courses.name,
        groupName: groups.name,
        roundNumber: attendance_rounds.round_number,
      })
      .from(attendance_records)
      .innerJoin(
        attendance_rounds,
        eq(attendance_records.round_id, attendance_rounds.id),
      )
      .innerJoin(sessions, eq(attendance_rounds.session_id, sessions.id))
      .innerJoin(courses, eq(sessions.course_id, courses.id))
      .innerJoin(groups, eq(sessions.group_id, groups.id))
      .where(eq(attendance_records.student_id, studentId))
      .orderBy(desc(attendance_records.recorded_at));

    return rows.map((row) => ({
      recordId: row.recordId,
      recordedAt: new Date(row.recordedAt).toISOString(),
      status: row.status,
      roundId: row.roundId,
      roundNumber: row.roundNumber,
      sessionId: row.sessionId,
      courseId: row.courseId,
      courseName: row.courseName,
      groupName: row.groupName,
    }));
  },

  async manualCheckInForTesting(studentId: string, classId: string) {
    const roundId = classId.trim();
    if (!roundId) {
      throw new ApiError(400, "Class ID is required.");
    }

    const [round] = await db
      .select()
      .from(attendance_rounds)
      .where(eq(attendance_rounds.id, roundId))
      .limit(1);

    if (!round || !round.is_active) {
      throw new ApiError(404, "Active class round not found for this ID.");
    }

    const session = await requireActiveSession(db, round.session_id);
    await ensureStudentEnrollment(db, studentId, session.group_id);
    await ensureNotAlreadyRecorded(db, roundId, studentId);

    const recordedAt = new Date().toISOString();
    await db.insert(attendance_records).values({
      round_id: roundId,
      student_id: studentId,
      status: "on_time",
      recorded_at: recordedAt,
      client_scan_id: `manual-${randomUUID()}`,
    });

    logger.warn("manual testing check-in recorded", {
      userId: studentId,
      roundId,
      sessionId: session.id,
    });

    return {
      roundId,
      recordedAt,
      status: "on_time",
      manual: true,
    };
  },
};
