import { randomBytes, createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  attendance_records,
  attendance_rounds,
  enrollments,
  excuse_requests,
  qr_tokens,
  sessions,
  users,
  type UserRole,
} from "@shared/schema";
import { ApiError } from "../errors/apiError";
import { logger } from "../utils/logger";
import { auditService } from "./auditService";

const VALID_CATEGORIES = new Set(["absence", "late"]);
const VALID_DECISIONS = new Set(["approve", "reject"]);

function assertCategory(category?: string) {
  if (!category) return "absence";
  if (!VALID_CATEGORIES.has(category)) {
    throw new ApiError(400, "Invalid category");
  }
  return category;
}

async function ensureEnrollmentForRound(
  studentId: string,
  roundId: string,
) {
  const [row] = await db
    .select({
      round: attendance_rounds,
      session: sessions,
    })
    .from(attendance_rounds)
    .innerJoin(sessions, eq(attendance_rounds.session_id, sessions.id))
    .where(eq(attendance_rounds.id, roundId))
    .limit(1);

  if (!row) {
    throw new ApiError(404, "Round not found");
  }

  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.student_id, studentId),
        eq(enrollments.group_id, row.session.group_id),
      ),
    )
    .limit(1);

  if (!enrollment) {
    throw new ApiError(403, "Not enrolled for this round");
  }

  return row;
}

async function getProfessorForRound(roundId: string) {
  const [row] = await db
    .select({
      round: attendance_rounds,
      session: sessions,
    })
    .from(attendance_rounds)
    .innerJoin(sessions, eq(attendance_rounds.session_id, sessions.id))
    .where(eq(attendance_rounds.id, roundId))
    .limit(1);

  return row?.session.professor_id;
}

async function createSystemToken(roundId: string) {
  const raw = randomBytes(12).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const now = new Date().toISOString();
  try {
    const [token] = await db
      .insert(qr_tokens)
      .values({
        round_id: roundId,
        token_hash: tokenHash,
        expires_at: now,
        consumed: true,
      })
      .returning();
    return token;
  } catch (error) {
    logger.error("failed to create system token", { roundId, error });
    throw error;
  }
}

export const excuseService = {
  async submitExcuse(
    studentId: string,
    payload: {
      roundId: string;
      reason: string;
      attachmentPath?: string | null;
      category?: string;
    },
  ) {
    if (!payload.reason || payload.reason.trim().length < 5) {
      throw new ApiError(400, "Reason is required");
    }

    const roundInfo = await ensureEnrollmentForRound(studentId, payload.roundId);

    const [existing] = await db
      .select()
      .from(excuse_requests)
      .where(
        and(
          eq(excuse_requests.round_id, payload.roundId),
          eq(excuse_requests.student_id, studentId),
        ),
      )
      .limit(1);

    if (existing && existing.status === "PENDING") {
      throw new ApiError(409, "Excuse already submitted for this round");
    }

    const [excuse] = await db
      .insert(excuse_requests)
      .values({
        round_id: payload.roundId,
        student_id: studentId,
        reason: payload.reason.trim(),
        attachment_path: payload.attachmentPath ?? null,
        status: "PENDING",
        category: assertCategory(payload.category),
      })
      .returning();

    logger.info("excuse submitted", {
      userId: studentId,
      roundId: payload.roundId,
      sessionId: roundInfo.session.id,
    });

    return excuse;
  },

  async listStudentExcuses(studentId: string) {
    const rows = await db
      .select({
        excuse: excuse_requests,
        round: attendance_rounds,
        session: sessions,
        professorId: sessions.professor_id,
      })
      .from(excuse_requests)
      .innerJoin(
        attendance_rounds,
        eq(excuse_requests.round_id, attendance_rounds.id),
      )
      .innerJoin(sessions, eq(attendance_rounds.session_id, sessions.id))
      .where(eq(excuse_requests.student_id, studentId))
      .orderBy(sql`excuse_requests.created_at DESC`);

    return rows.map((row) => ({
      id: row.excuse.id,
      roundId: row.excuse.round_id,
      sessionId: row.session.id,
      status: row.excuse.status,
      reason: row.excuse.reason,
      category: row.excuse.category,
      attachmentPath: row.excuse.attachment_path,
      reviewedAt: row.excuse.reviewed_at,
      createdAt: row.excuse.created_at,
    }));
  },

  async listSessionExcuses(
    professorId: string,
    sessionId: string,
    status?: string,
  ) {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) throw new ApiError(404, "Session not found");
    if (session.professor_id !== professorId) {
      throw new ApiError(403, "You do not own this session");
    }

    const rows = await db
      .select({
        excuse: excuse_requests,
        round: attendance_rounds,
        student: users,
      })
      .from(excuse_requests)
      .innerJoin(
        attendance_rounds,
        eq(excuse_requests.round_id, attendance_rounds.id),
      )
      .innerJoin(users, eq(excuse_requests.student_id, users.id))
      .where(
        and(
          eq(attendance_rounds.session_id, sessionId),
          status ? eq(excuse_requests.status, status) : sql`1=1`,
        ),
      )
      .orderBy(sql`excuse_requests.created_at DESC`);

    return rows.map((row) => ({
      id: row.excuse.id,
      status: row.excuse.status,
      category: row.excuse.category,
      reason: row.excuse.reason,
      attachmentPath: row.excuse.attachment_path,
      roundId: row.excuse.round_id,
      roundNumber: row.round.round_number,
      student: {
        id: row.student.id,
        username: row.student.username,
        displayName: row.student.display_name,
      },
      createdAt: row.excuse.created_at,
      reviewedAt: row.excuse.reviewed_at,
    }));
  },

  async reviewExcuse(
    professorId: string,
    excuseId: string,
    decision: "approve" | "reject",
    note?: string,
  ) {
    if (!VALID_DECISIONS.has(decision)) {
      throw new ApiError(400, "Invalid decision");
    }

    const [excuseRow] = await db
      .select({
        excuse: excuse_requests,
        round: attendance_rounds,
        session: sessions,
      })
      .from(excuse_requests)
      .innerJoin(
        attendance_rounds,
        eq(excuse_requests.round_id, attendance_rounds.id),
      )
      .innerJoin(sessions, eq(attendance_rounds.session_id, sessions.id))
      .where(eq(excuse_requests.id, excuseId))
      .limit(1);

    if (!excuseRow) {
      throw new ApiError(404, "Excuse not found");
    }

    if (excuseRow.session.professor_id !== professorId) {
      throw new ApiError(403, "You do not own this session");
    }

    const reviewedAt = new Date().toISOString();

    if (excuseRow.excuse.status !== "PENDING") {
      throw new ApiError(409, "Excuse already reviewed");
    }

    const targetRoundId = excuseRow.excuse.round_id;
    const targetStudentId = excuseRow.excuse.student_id;

    const [updated] = await db
      .update(excuse_requests)
      .set({
        status: decision === "approve" ? "APPROVED" : "REJECTED",
        resolution_note: note ?? null,
        reviewed_at: reviewedAt,
        reviewed_by: professorId,
      })
      .where(eq(excuse_requests.id, excuseId))
      .returning();

    if (decision === "approve") {
      const [existingAttendance] = await db
        .select()
        .from(attendance_records)
        .where(
          and(
            eq(attendance_records.round_id, targetRoundId),
            eq(attendance_records.student_id, targetStudentId),
          ),
        )
        .limit(1);

      if (existingAttendance) {
        await db
          .update(attendance_records)
          .set({ status: "excused" })
          .where(eq(attendance_records.id, existingAttendance.id));
      } else {
        await db.insert(attendance_records).values({
          round_id: targetRoundId,
          student_id: targetStudentId,
          qr_token_id: null,
          status: "excused",
          recorded_at: reviewedAt,
        });
      }
    }

    await auditService.log({
      actorId: professorId,
      action: decision === "approve" ? "excuse_approve" : "excuse_reject",
      entityType: "excuse",
      entityId: excuseId,
      before: excuseRow.excuse,
      after: updated,
      reason: note ?? null,
    });

    logger.info("excuse reviewed", {
      excuseId,
      decision,
      professorId,
      roundId: targetRoundId,
    });

    return updated;
  },

  async getAttachmentPathForAuthorizedUser(
    userId: string,
    role: UserRole,
    excuseId: string,
  ) {
    const [row] = await db
      .select({
        excuse: excuse_requests,
        round: attendance_rounds,
        session: sessions,
      })
      .from(excuse_requests)
      .innerJoin(
        attendance_rounds,
        eq(excuse_requests.round_id, attendance_rounds.id),
      )
      .innerJoin(sessions, eq(attendance_rounds.session_id, sessions.id))
      .where(eq(excuse_requests.id, excuseId))
      .limit(1);

    if (!row || !row.excuse.attachment_path) {
      throw new ApiError(404, "Attachment not found");
    }

    if (role === "student" && row.excuse.student_id !== userId) {
      throw new ApiError(403, "Not permitted to view this attachment");
    }

    if (role === "professor" && row.session.professor_id !== userId) {
      throw new ApiError(403, "Not permitted to view this attachment");
    }

    // Admins can view any attachment
    // No additional check needed for admin role.

    return row.excuse.attachment_path;
  },
};
