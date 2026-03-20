import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  attendance_records,
  attendance_rounds,
  courses,
  enrollments,
  groups,
  sessions,
  users,
} from "@shared/schema";
import { ApiError } from "../errors/apiError";
import {
  emitRoundClosed,
  emitRoundQrUpdated,
  emitSessionEnded,
  emitSessionRefresh,
} from "../websocket/manager";
import { roundService } from "./roundService";
import { buildQrPayload, qrService } from "./qrService";
import { auditService } from "./auditService";

export const sessionService = {
  /**
   * Starts a new attendance session for a professor-owned group and opens round 1.
   */
  async startSession(
    professorId: string,
    groupId: string,
    options?: {
      geofenceEnabled?: boolean;
      latitude?: number | null;
      longitude?: number | null;
      geofenceRadiusM?: number | null;
      isBreakRound?: boolean;
    },
  ) {
    const [row] = await db
      .select({
        group: groups,
        course: courses,
      })
      .from(groups)
      .leftJoin(courses, eq(groups.course_id, courses.id))
      .where(eq(groups.id, groupId))
      .limit(1);

    if (!row?.group) {
      throw new ApiError(404, "Group not found");
    }

    const course = row.course;

    if (!course || course.professor_id !== professorId) {
      throw new ApiError(403, "You must own the course to start sessions");
    }

    const [session] = await db
      .insert(sessions)
      .values({
        group_id: groupId,
        course_id: course.id,
        professor_id: professorId,
        starts_at: new Date().toISOString(),
        is_active: true,
        status: "active",
      })
      .returning();

    const { round, token, qrPayload } = await roundService.createRound(
      session.id,
      options,
    );

    await auditService.log({
      actorId: professorId,
      action: "session_start",
      entityType: "session",
      entityId: session.id,
      after: session,
    });
    await auditService.log({
      actorId: professorId,
      action: "round_open",
      entityType: "round",
      entityId: round.id,
      after: round,
    });

    return {
      session,
      round,
      token,
      qrPayload,
      course,
      group: row.group,
    };
  },

  /**
   * Creates and broadcasts a new round within an active session.
   */
  async startRound(
    professorId: string,
    sessionId: string,
    options?: {
      geofenceEnabled?: boolean;
      latitude?: number | null;
      longitude?: number | null;
      geofenceRadiusM?: number | null;
      isBreakRound?: boolean;
    },
  ) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    if (session.professor_id !== professorId) {
      throw new ApiError(403, "You do not own this session");
    }

    if (!session.is_active) {
      throw new ApiError(400, "Cannot start a round on an inactive session");
    }

    const { round, token, qrPayload } = await roundService.createRound(
      sessionId,
      options,
    );
    await auditService.log({
      actorId: professorId,
      action: "round_open",
      entityType: "round",
      entityId: round.id,
      after: round,
    });
    return { round, token, qrPayload };
  },

  /**
   * Gracefully closes the active round for a session, preventing new scans.
   */
  async closeRound(professorId: string, sessionId: string, roundId: string) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    if (session.professor_id !== professorId) {
      throw new ApiError(403, "You do not own this session");
    }

    const [round] = await db
      .select()
      .from(attendance_rounds)
      .where(
        and(
          eq(attendance_rounds.id, roundId),
          eq(attendance_rounds.session_id, sessionId),
        ),
      )
      .limit(1);

    if (!round) {
      throw new ApiError(404, "Round not found for this session");
    }

    if (!round.is_active) {
      throw new ApiError(400, "Round already ended");
    }

    const endedAt = new Date().toISOString();
    const [updated] = await db
      .update(attendance_rounds)
      .set({ is_active: false, ends_at: endedAt })
      .where(eq(attendance_rounds.id, roundId))
      .returning();

    await auditService.log({
      actorId: professorId,
      action: "round_close",
      entityType: "round",
      entityId: roundId,
      before: round,
      after: updated,
    });

    emitRoundClosed(sessionId, {
      sessionId,
      roundId,
      endedAt,
    });
    emitSessionRefresh(sessionId, {
      sessionId,
      reason: "round_closed",
      roundId,
    });

    return { round: updated, session };
  },

  /**
   * Ends an active session and closes any in-flight rounds.
   */
  async endSession(professorId: string, sessionId: string) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    if (session.professor_id !== professorId) {
      throw new ApiError(403, "You do not own this session");
    }

    if (!session.is_active) {
      throw new ApiError(400, "Session already ended");
    }

    await db
      .update(sessions)
      .set({
        is_active: false,
        ends_at: new Date().toISOString(),
        status: "ended",
      })
      .where(eq(sessions.id, sessionId));

    await db
      .update(attendance_rounds)
      .set({
        is_active: false,
        ends_at: new Date().toISOString(),
      })
      .where(
        and(
          eq(attendance_rounds.session_id, sessionId),
          eq(attendance_rounds.is_active, true),
        ),
      );

    const [{ totalRounds }] = await db
      .select({
        totalRounds: sql<number>`COUNT(${attendance_rounds.id})`,
      })
      .from(attendance_rounds)
      .where(eq(attendance_rounds.session_id, sessionId));

    const [{ attendanceCount }] = await db
      .select({
        attendanceCount: sql<number>`COUNT(${attendance_records.id})`,
      })
      .from(attendance_records)
      .innerJoin(attendance_rounds, eq(attendance_records.round_id, attendance_rounds.id))
      .where(eq(attendance_rounds.session_id, sessionId));

    await auditService.log({
      actorId: professorId,
      action: "session_end",
      entityType: "session",
      entityId: sessionId,
      before: session,
      after: { status: "ended", is_active: false },
    });

    emitSessionEnded(sessionId, {
      sessionId,
      endedAt: new Date().toISOString(),
      summary: {
        totalRounds: Number(totalRounds ?? 0),
        attendanceCount: Number(attendanceCount ?? 0),
      },
    });

    return session;
  },

  /**
   * Returns per-round and per-student statistics for a session.
   */
  async getSessionStats(professorId: string, sessionId: string) {
    const [sessionRow] = await db
      .select({
        session: sessions,
        course: courses,
        group: groups,
      })
      .from(sessions)
      .leftJoin(courses, eq(sessions.course_id, courses.id))
      .leftJoin(groups, eq(sessions.group_id, groups.id))
      .where(eq(sessions.id, sessionId))
      .limit(1);

    const session = sessionRow?.session;

    if (!session) {
      throw new ApiError(404, "Session not found");
    }

    if (session.professor_id !== professorId) {
      throw new ApiError(403, "You do not own this session");
    }

    const rounds = await db
      .select({
        roundId: attendance_rounds.id,
        roundNumber: attendance_rounds.round_number,
        startsAt: attendance_rounds.starts_at,
        endsAt: attendance_rounds.ends_at,
        isActive: attendance_rounds.is_active,
        attendanceCount: sql<number>`COUNT(${attendance_records.id})`,
      })
      .from(attendance_rounds)
      .leftJoin(attendance_records, eq(attendance_records.round_id, attendance_rounds.id))
      .where(eq(attendance_rounds.session_id, sessionId))
      .groupBy(attendance_rounds.id);

    const studentRows = await db
      .select({
        studentId: users.id,
        username: users.username,
        displayName: users.display_name,
        attendanceCount: sql<number>`(
          SELECT COUNT(*)
          FROM ${attendance_records} rec
          JOIN ${attendance_rounds} ar ON rec.round_id = ar.id
          WHERE rec.student_id = ${users.id} AND ar.session_id = ${sessionId}
        )`,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.student_id))
      .where(
        and(
          eq(enrollments.group_id, session.group_id),
          eq(enrollments.course_id, session.course_id),
        ),
      );

    const [{ attendanceCount: totalAttendance }] = await db
      .select({
        attendanceCount: sql<number>`COUNT(${attendance_records.id})`,
      })
      .from(attendance_records)
      .innerJoin(attendance_rounds, eq(attendance_records.round_id, attendance_rounds.id))
      .where(eq(attendance_rounds.session_id, sessionId));

    return {
      sessionId,
      course: sessionRow?.course
        ? {
            id: sessionRow.course.id,
            code: sessionRow.course.code,
            name: sessionRow.course.name,
            term: sessionRow.course.term,
          }
        : null,
      group: sessionRow?.group
        ? {
            id: sessionRow.group.id,
            name: sessionRow.group.name,
          }
        : null,
      rounds: rounds.map((round) => ({
        roundId: round.roundId,
        roundNumber: round.roundNumber,
        startsAt: new Date(round.startsAt).toISOString(),
        endsAt: round.endsAt ? new Date(round.endsAt).toISOString() : null,
        isActive: round.isActive,
        attendanceCount: Number(round.attendanceCount ?? 0),
      })),
      students: studentRows.map((row) => ({
        studentId: row.studentId,
        username: row.username,
        displayName: row.displayName,
        attendanceCount: Number(row.attendanceCount ?? 0),
      })),
      recentScans: (
        await db
          .select({
            studentId: users.id,
            displayName: users.display_name,
            recordedAt: attendance_records.recorded_at,
            status: attendance_records.status,
            roundId: attendance_rounds.id,
            roundNumber: attendance_rounds.round_number,
          })
          .from(attendance_records)
          .innerJoin(
            attendance_rounds,
            eq(attendance_records.round_id, attendance_rounds.id),
          )
          .innerJoin(users, eq(attendance_records.student_id, users.id))
          .where(eq(attendance_rounds.session_id, sessionId))
          .orderBy(desc(attendance_records.recorded_at))
          .limit(8)
      ).map((row) => ({
        studentId: row.studentId,
        displayName: row.displayName,
        recordedAt: row.recordedAt,
        status: row.status,
        roundId: row.roundId,
        roundNumber: row.roundNumber,
      })),
      totals: {
        totalRounds: rounds.length,
        totalStudents: studentRows.length,
        totalAttendance: Number(totalAttendance ?? 0),
      },
    };
  },

  /**
   * Builds a flat export of attendance records for the session.
   */
  async getSessionExport(professorId: string, sessionId: string) {
    const [sessionRow] = await db
      .select({
        session: sessions,
        course: courses,
        group: groups,
      })
      .from(sessions)
      .leftJoin(courses, eq(sessions.course_id, courses.id))
      .leftJoin(groups, eq(sessions.group_id, groups.id))
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!sessionRow?.session) {
      throw new ApiError(404, "Session not found");
    }

    if (sessionRow.session.professor_id !== professorId) {
      throw new ApiError(403, "You do not own this session");
    }

    const roundRows = await db
      .select({
        roundId: attendance_rounds.id,
        roundNumber: attendance_rounds.round_number,
      })
      .from(attendance_rounds)
      .where(eq(attendance_rounds.session_id, sessionId))
      .orderBy(attendance_rounds.round_number);

    const enrolledStudents = await db
      .select({
        studentId: users.id,
        studentUsername: users.username,
        studentName: users.display_name,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.student_id))
      .where(
        and(
          eq(enrollments.course_id, sessionRow.session.course_id),
          eq(enrollments.group_id, sessionRow.session.group_id),
        ),
      )
      .orderBy(users.username);

    const recordedRows = await db
      .select({
        roundNumber: attendance_rounds.round_number,
        roundId: attendance_rounds.id,
        studentUsername: users.username,
        studentName: users.display_name,
        status: attendance_records.status,
        recordedAt: attendance_records.recorded_at,
        studentId: attendance_records.student_id,
      })
      .from(attendance_records)
      .innerJoin(
        attendance_rounds,
        eq(attendance_records.round_id, attendance_rounds.id),
      )
      .innerJoin(users, eq(attendance_records.student_id, users.id))
      .where(eq(attendance_rounds.session_id, sessionId))
      .orderBy(
        attendance_rounds.round_number,
        attendance_records.recorded_at,
      );

    const recordedByRoundAndStudent = new Map(
      recordedRows.map((row) => [`${row.roundId}::${row.studentId}`, row]),
    );

    const records = roundRows.flatMap((round) =>
      enrolledStudents.map((student) => {
        const existing = recordedByRoundAndStudent.get(
          `${round.roundId}::${student.studentId}`,
        );
        if (existing) {
          return {
            roundNumber: existing.roundNumber,
            roundId: existing.roundId,
            studentUsername: existing.studentUsername,
            studentName: existing.studentName,
            status: existing.status,
            recordedAt: existing.recordedAt,
          };
        }
        return {
          roundNumber: round.roundNumber,
          roundId: round.roundId,
          studentUsername: student.studentUsername,
          studentName: student.studentName,
          status: "absent",
          recordedAt: null,
        };
      }),
    );

    return {
      session: sessionRow.session,
      course: sessionRow.course,
      group: sessionRow.group,
      records,
    };
  },

  /**
   * Fetches session details plus the latest active round and next QR token.
   */
  async getSessionDetail(professorId: string, sessionId: string) {
    const [sessionRow] = await db
      .select({
        session: sessions,
        course: courses,
        group: groups,
      })
      .from(sessions)
      .innerJoin(courses, eq(sessions.course_id, courses.id))
      .innerJoin(groups, eq(sessions.group_id, groups.id))
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!sessionRow) {
      throw new ApiError(404, "Session not found");
    }

    if (sessionRow.session.professor_id !== professorId) {
      throw new ApiError(403, "You do not own this session");
    }

    const [activeRound] = await db
      .select()
      .from(attendance_rounds)
      .where(
        and(
          eq(attendance_rounds.session_id, sessionId),
          eq(attendance_rounds.is_active, true),
        ),
      )
      .orderBy(desc(attendance_rounds.round_number))
      .limit(1);

    let qr:
      | { token: string; expiresAt: string; qrPayload: string; roundId: string }
      | null = null;
    let activeRoundAttendance = 0;

    if (activeRound) {
      const nextToken = await qrService.generateToken(activeRound.id);
      const qrPayload = buildQrPayload({
        roundId: activeRound.id,
        token: nextToken.rawToken,
        issuedAt: nextToken.issuedAt,
        expiresAt: nextToken.expiresAt.toISOString(),
      });

      qr = {
        token: nextToken.rawToken,
        expiresAt: nextToken.expiresAt.toISOString(),
        qrPayload,
        roundId: activeRound.id,
      };

      emitRoundQrUpdated(sessionId, {
        sessionId,
        roundId: activeRound.id,
        token: nextToken.rawToken,
        expiresAt: nextToken.expiresAt.toISOString(),
        qrPayload,
      });

      const [{ count }] = await db
        .select({
          count: sql<number>`COUNT(${attendance_records.id})`,
        })
        .from(attendance_records)
        .where(eq(attendance_records.round_id, activeRound.id));

      activeRoundAttendance = Number(count ?? 0);
    }

    const [{ attendanceCount }] = await db
      .select({
        attendanceCount: sql<number>`COUNT(${attendance_records.id})`,
      })
      .from(attendance_records)
      .innerJoin(attendance_rounds, eq(attendance_records.round_id, attendance_rounds.id))
      .where(eq(attendance_rounds.session_id, sessionId));

    return {
      session: sessionRow.session,
      course: sessionRow.course,
      group: sessionRow.group,
      activeRound: activeRound
        ? {
            id: activeRound.id,
            roundNumber: activeRound.round_number,
            startsAt: activeRound.starts_at,
            endsAt: activeRound.ends_at ?? null,
            isActive: activeRound.is_active,
            attendanceCount: activeRoundAttendance,
            geofenceEnabled: activeRound.geofence_enabled,
            geofenceRadiusM: activeRound.geofence_radius_m,
            latitude: activeRound.latitude,
            longitude: activeRound.longitude,
            isBreakRound: activeRound.is_break_round,
          }
        : null,
      qr,
      totals: {
        attendanceCount: Number(attendanceCount ?? 0),
      },
    };
  },

  /**
   * Detailed analytics: per-student attendance %, on-time vs late, excused, absence trends.
   */
  async getSessionAnalytics(professorId: string, sessionId: string) {
    const [sessionRow] = await db
      .select({
        session: sessions,
        course: courses,
        group: groups,
      })
      .from(sessions)
      .leftJoin(courses, eq(sessions.course_id, courses.id))
      .leftJoin(groups, eq(sessions.group_id, groups.id))
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!sessionRow?.session) throw new ApiError(404, "Session not found");
    if (sessionRow.session.professor_id !== professorId) {
      throw new ApiError(403, "You do not own this session");
    }

    const students = await db
      .select({
        studentId: users.id,
        username: users.username,
        displayName: users.display_name,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.student_id, users.id))
      .where(
        and(
          eq(enrollments.group_id, sessionRow.session.group_id),
          eq(enrollments.course_id, sessionRow.session.course_id),
        ),
      );

    const rounds = await db
      .select({
        roundId: attendance_rounds.id,
        roundNumber: attendance_rounds.round_number,
      })
      .from(attendance_rounds)
      .where(eq(attendance_rounds.session_id, sessionId));

    const records = await db
      .select({
        roundId: attendance_records.round_id,
        studentId: attendance_records.student_id,
        status: attendance_records.status,
      })
      .from(attendance_records)
      .innerJoin(
        attendance_rounds,
        eq(attendance_records.round_id, attendance_rounds.id),
      )
      .where(eq(attendance_rounds.session_id, sessionId));

    const perStudent = new Map<
      string,
      {
        onTime: number;
        late: number;
        excused: number;
      }
    >();

    const perRound = new Map<
      string,
      {
        onTime: number;
        late: number;
        excused: number;
      }
    >();

    records.forEach((rec) => {
      const studentStats =
        perStudent.get(rec.studentId) ?? { onTime: 0, late: 0, excused: 0 };
      const roundStats =
        perRound.get(rec.roundId) ?? { onTime: 0, late: 0, excused: 0 };

      if (rec.status === "late") {
        studentStats.late += 1;
        roundStats.late += 1;
      } else if (rec.status === "excused") {
        studentStats.excused += 1;
        roundStats.excused += 1;
      } else {
        studentStats.onTime += 1;
        roundStats.onTime += 1;
      }

      perStudent.set(rec.studentId, studentStats);
      perRound.set(rec.roundId, roundStats);
    });

    const totalRounds = rounds.length || 1;
    const totalStudents = students.length;
    const safeTotalStudents = totalStudents || 1;

    const studentAnalytics = students.map((student) => {
      const stats =
        perStudent.get(student.studentId) ?? { onTime: 0, late: 0, excused: 0 };
      const attended = stats.onTime + stats.late + stats.excused;
      const attendancePercent = Math.round(
        (attended / totalRounds) * 100,
      );
      const absences = totalRounds - attended;
      return {
        studentId: student.studentId,
        username: student.username,
        displayName: student.displayName,
        present: stats.onTime,
        late: stats.late,
        excused: stats.excused,
        absences,
        attendancePercent: Math.max(0, Math.min(100, attendancePercent)),
      };
    });

    const roundAnalytics = rounds.map((round) => {
      const stats = perRound.get(round.roundId) ?? {
        onTime: 0,
        late: 0,
        excused: 0,
      };
      const totalPresent = stats.onTime + stats.late + stats.excused;
      const absences = safeTotalStudents - totalPresent;
      return {
        roundId: round.roundId,
        roundNumber: round.roundNumber,
        present: stats.onTime,
        late: stats.late,
        excused: stats.excused,
        absent: absences < 0 ? 0 : absences,
      };
    });

    return {
      sessionId,
      course: sessionRow.course,
      group: sessionRow.group,
      students: studentAnalytics,
      rounds: roundAnalytics,
      totals: {
        totalStudents: students.length,
        totalRounds: rounds.length,
      },
    };
  },

  async exportSessionAnalytics(professorId: string, sessionId: string) {
    const analytics = await this.getSessionAnalytics(professorId, sessionId);
    const headers = [
      "student_id",
      "username",
      "display_name",
      "present",
      "late",
      "excused",
      "absent",
      "attendance_percent",
    ];
    const lines = [
      headers.join(","),
      ...analytics.students.map((s) =>
        [
          s.studentId,
          s.username,
          s.displayName,
          s.present,
          s.late,
          s.excused,
          s.absences,
          s.attendancePercent,
        ].join(","),
      ),
    ];
    return lines.join("\n");
  },

  async exportPeriodAttendanceCsv(
    professorId: string,
    period: "weekly" | "monthly",
  ) {
    const now = new Date();
    const periodStart = new Date(now);
    if (period === "weekly") {
      const day = periodStart.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      periodStart.setDate(periodStart.getDate() + mondayOffset);
      periodStart.setHours(0, 0, 0, 0);
    } else {
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);
    }

    const periodStartIso = periodStart.toISOString();
    const periodEndIso = now.toISOString();

    const periodSessions = await db
      .select({
        sessionId: sessions.id,
        courseId: sessions.course_id,
        groupId: sessions.group_id,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.professor_id, professorId),
          gte(sessions.starts_at, periodStartIso),
          lt(sessions.starts_at, periodEndIso),
        ),
      );

    const sessionIds = periodSessions.map((row) => row.sessionId);
    const headers = [
      "student_id",
      "display_name",
      "username",
      "email",
      "attended_classes",
      "missed_classes",
      "total_classes",
      "attendance_percent",
      "period",
      "from",
      "to",
    ];
    if (!sessionIds.length) {
      return `${headers.join(",")}\n`;
    }

    const courseIds = Array.from(new Set(periodSessions.map((s) => s.courseId)));
    const groupIds = Array.from(new Set(periodSessions.map((s) => s.groupId)));

    const enrollmentRows = await db
      .select({
        studentId: enrollments.student_id,
        courseId: enrollments.course_id,
        groupId: enrollments.group_id,
        username: users.username,
        displayName: users.display_name,
        email: users.email,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.student_id))
      .where(
        and(
          inArray(enrollments.course_id, courseIds),
          inArray(enrollments.group_id, groupIds),
        ),
      );

    const attendanceRows = await db
      .select({
        sessionId: attendance_rounds.session_id,
        studentId: attendance_records.student_id,
      })
      .from(attendance_records)
      .innerJoin(
        attendance_rounds,
        eq(attendance_records.round_id, attendance_rounds.id),
      )
      .where(inArray(attendance_rounds.session_id, sessionIds));

    const attendanceSet = new Set(
      attendanceRows.map((row) => `${row.sessionId}::${row.studentId}`),
    );
    const sessionPairSet = new Set(
      periodSessions.map((row) => `${row.courseId}::${row.groupId}`),
    );

    const aggregate = new Map<
      string,
      {
        studentId: string;
        username: string;
        displayName: string;
        email: string;
        attended: number;
        missed: number;
      }
    >();

    const enrollmentsByPair = new Map<string, typeof enrollmentRows>();
    for (const row of enrollmentRows) {
      const key = `${row.courseId}::${row.groupId}`;
      const list = enrollmentsByPair.get(key) ?? [];
      list.push(row);
      enrollmentsByPair.set(key, list);
    }

    for (const session of periodSessions) {
      const pairKey = `${session.courseId}::${session.groupId}`;
      if (!sessionPairSet.has(pairKey)) continue;
      const enrolled = enrollmentsByPair.get(pairKey) ?? [];
      for (const student of enrolled) {
        const existing = aggregate.get(student.studentId) ?? {
          studentId: student.studentId,
          username: student.username,
          displayName: student.displayName,
          email: student.email,
          attended: 0,
          missed: 0,
        };
        const didAttend = attendanceSet.has(
          `${session.sessionId}::${student.studentId}`,
        );
        if (didAttend) {
          existing.attended += 1;
        } else {
          existing.missed += 1;
        }
        aggregate.set(student.studentId, existing);
      }
    }

    const escape = (value: string | number | null | undefined) => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
        return `"${str.replace(/\"/g, "\"\"")}"`;
      }
      return str;
    };

    const lines = [
      headers.join(","),
      ...Array.from(aggregate.values())
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((row) => {
          const total = row.attended + row.missed;
          const pct = total > 0 ? Math.round((row.attended / total) * 100) : 0;
          return [
            row.studentId,
            row.displayName,
            row.username,
            row.email,
            row.attended,
            row.missed,
            total,
            pct,
            period,
            periodStartIso,
            periodEndIso,
          ]
            .map(escape)
            .join(",");
        }),
    ];

    return lines.join("\n");
  },

  async listSessionLogDates(professorId: string) {
    const rows = await db
      .select({
        openedOn: sql<string>`DATE(${sessions.starts_at})`,
        sessionCount: sql<number>`COUNT(${sessions.id})`,
      })
      .from(sessions)
      .where(eq(sessions.professor_id, professorId))
      .groupBy(sql`DATE(${sessions.starts_at})`)
      .orderBy(desc(sql`DATE(${sessions.starts_at})`));

    return rows.map((row) => ({
      date: row.openedOn,
      sessionCount: Number(row.sessionCount ?? 0),
    }));
  },

  async getAttendanceLogByDate(professorId: string, openedOn: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(openedOn)) {
      throw new ApiError(400, "Date must be in YYYY-MM-DD format.");
    }

    const sessionRows = await db
      .select({
        sessionId: sessions.id,
        startsAt: sessions.starts_at,
        endsAt: sessions.ends_at,
        isActive: sessions.is_active,
        courseCode: courses.code,
        courseName: courses.name,
        groupName: groups.name,
      })
      .from(sessions)
      .innerJoin(courses, eq(sessions.course_id, courses.id))
      .innerJoin(groups, eq(sessions.group_id, groups.id))
      .where(
        and(
          eq(sessions.professor_id, professorId),
          eq(sql`DATE(${sessions.starts_at})`, openedOn),
        ),
      )
      .orderBy(desc(sessions.starts_at));

    const recordRows = await db
      .select({
        recordId: attendance_records.id,
        sessionId: sessions.id,
        recordedAt: attendance_records.recorded_at,
        status: attendance_records.status,
        roundNumber: attendance_rounds.round_number,
        studentName: users.display_name,
        studentUsername: users.username,
        courseCode: courses.code,
        courseName: courses.name,
        groupName: groups.name,
      })
      .from(attendance_records)
      .innerJoin(
        attendance_rounds,
        eq(attendance_records.round_id, attendance_rounds.id),
      )
      .innerJoin(sessions, eq(attendance_rounds.session_id, sessions.id))
      .innerJoin(courses, eq(sessions.course_id, courses.id))
      .innerJoin(groups, eq(sessions.group_id, groups.id))
      .innerJoin(users, eq(attendance_records.student_id, users.id))
      .where(
        and(
          eq(sessions.professor_id, professorId),
          eq(sql`DATE(${sessions.starts_at})`, openedOn),
        ),
      )
      .orderBy(desc(attendance_records.recorded_at), attendance_rounds.round_number);

    return {
      date: openedOn,
      sessions: sessionRows.map((row) => ({
        sessionId: row.sessionId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        isActive: row.isActive,
        courseCode: row.courseCode,
        courseName: row.courseName,
        groupName: row.groupName,
      })),
      records: recordRows.map((row) => ({
        recordId: row.recordId,
        sessionId: row.sessionId,
        recordedAt: row.recordedAt,
        status: row.status,
        roundNumber: row.roundNumber,
        studentName: row.studentName,
        studentUsername: row.studentUsername,
        courseCode: row.courseCode,
        courseName: row.courseName,
        groupName: row.groupName,
      })),
    };
  },

  async exportAttendanceLogByDate(professorId: string, openedOn: string) {
    const log = await this.getAttendanceLogByDate(professorId, openedOn);

    const headers = [
      "session_id",
      "course_code",
      "course_name",
      "group_name",
      "student_name",
      "student_username",
      "round_number",
      "status",
      "recorded_at",
    ];

    const escape = (value: string | number | null | undefined) => {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
        return `"${str.replace(/\"/g, "\"\"")}"`;
      }
      return str;
    };

    const lines = [
      headers.join(","),
      ...log.records.map((row) =>
        [
          row.sessionId,
          row.courseCode,
          row.courseName,
          row.groupName,
          row.studentName,
          row.studentUsername,
          row.roundNumber,
          row.status,
          row.recordedAt,
        ]
          .map(escape)
          .join(","),
      ),
    ];

    return lines.join("\n");
  },

  async getCourseAttendanceSummary(professorId: string, courseId: string) {
    if (!courseId) {
      throw new ApiError(400, "courseId is required.");
    }

    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    if (!course) {
      throw new ApiError(404, "Course not found.");
    }
    if (course.professor_id !== professorId) {
      throw new ApiError(403, "You do not own this course.");
    }

    const sessionRows = await db
      .select({ sessionId: sessions.id })
      .from(sessions)
      .where(eq(sessions.course_id, courseId));

    const totalSessions = sessionRows.length;
    const sessionIds = sessionRows.map((row) => row.sessionId);

    const enrollmentRows = await db
      .select({
        studentId: enrollments.student_id,
        displayName: users.display_name,
        username: users.username,
        email: users.email,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.student_id))
      .where(eq(enrollments.course_id, courseId));

    if (!enrollmentRows.length) {
      return {
        course: {
          id: course.id,
          code: course.code,
          name: course.name,
          term: course.term,
        },
        totalSessions,
        students: [],
      };
    }

    const attendanceRows = sessionIds.length
      ? await db
          .select({
            sessionId: attendance_rounds.session_id,
            studentId: attendance_records.student_id,
          })
          .from(attendance_records)
          .innerJoin(
            attendance_rounds,
            eq(attendance_records.round_id, attendance_rounds.id),
          )
          .where(inArray(attendance_rounds.session_id, sessionIds))
      : [];

    const attendanceSet = new Set(
      attendanceRows.map((row) => `${row.sessionId}::${row.studentId}`),
    );

    const students = enrollmentRows.map((student) => {
      let attended = 0;
      for (const sessionId of sessionIds) {
        if (attendanceSet.has(`${sessionId}::${student.studentId}`)) {
          attended += 1;
        }
      }
      const total = totalSessions;
      const missed = Math.max(0, total - attended);
      const attendancePercent =
        total > 0 ? Math.round((attended / total) * 100) : 0;

      return {
        studentId: student.studentId,
        displayName: student.displayName,
        username: student.username,
        email: student.email,
        attendedClasses: attended,
        missedClasses: missed,
        totalClasses: total,
        attendancePercent,
        status: attendancePercent >= 75 ? "pass" : "fail",
      };
    });

    return {
      course: {
        id: course.id,
        code: course.code,
        name: course.name,
        term: course.term,
      },
      totalSessions,
      students: students.sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    };
  },
};
