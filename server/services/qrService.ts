import { createHash, randomBytes } from "crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "../db";
import { qr_tokens } from "@shared/schema";
import { ApiError } from "../errors/apiError";
import { logger } from "../utils/logger";

const TOKEN_TTL_MS = 15_000;

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Serialize QR metadata into a payload string for the client scanner.
 */
export function buildQrPayload(params: {
  roundId: string;
  token: string;
  sessionId?: string;
  courseId?: string;
  groupId?: string;
  geofenceEnabled?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusM?: number | null;
  isBreakRound?: boolean;
}) {
  return JSON.stringify(params);
}

export const qrService = {
  /**
   * Create a short-lived QR token for a round.
   */
  async generateToken(roundId: string, executor: DbExecutor = db) {
    const rawToken = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    const tokenHash = hashToken(rawToken);

    const [record] = await executor
      .insert(qr_tokens)
      .values({
        round_id: roundId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      })
      .returning();

    return {
      id: record.id,
      rawToken,
      expiresAt,
    };
  },

  /**
   * Validates a token and atomically consumes it to prevent reuse.
   * Throws ApiError with appropriate status codes on failure.
   */
  async validateAndConsumeToken(
    roundId: string,
    token: string,
    executor: DbExecutor = db,
  ) {
    const tokenHash = hashToken(token);
    const [record] = await executor
      .select()
      .from(qr_tokens)
      .where(
        and(
          eq(qr_tokens.round_id, roundId),
          eq(qr_tokens.token_hash, tokenHash),
        ),
      )
      .limit(1);

    if (!record) {
      throw new ApiError(400, "Invalid QR token", "invalid_token");
    }

    if (record.consumed) {
      throw new ApiError(409, "QR token already used", "token_already_consumed");
    }

    const nowIso = new Date().toISOString();
    if (record.expires_at <= nowIso || new Date(record.expires_at).getTime() < Date.now()) {
      throw new ApiError(400, "QR token has expired", "token_expired");
    }

    const [consumed] = await executor
      .update(qr_tokens)
      .set({ consumed: true })
      .where(
        and(
          eq(qr_tokens.id, record.id),
          eq(qr_tokens.consumed, false),
          gt(qr_tokens.expires_at, nowIso),
        ),
      )
      .returning();

    if (!consumed) {
      throw new ApiError(409, "QR token already used");
    }

    return consumed;
  },
};

export async function cleanupExpiredTokens() {
  const nowIso = new Date().toISOString();
  try {
    await db.delete(qr_tokens).where(lt(qr_tokens.expires_at, nowIso));
    logger.info("Expired QR tokens cleanup finished");
  } catch (error) {
    logger.error("Expired QR tokens cleanup failed", { error });
  }
}
