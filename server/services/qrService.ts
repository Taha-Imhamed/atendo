import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "../db";
import { qr_tokens } from "@shared/schema";
import { ApiError } from "../errors/apiError";
import { logger } from "../utils/logger";

const TOKEN_TTL_MS = Math.max(
  15_000,
  Number(process.env.QR_TOKEN_TTL_SECONDS ?? 120) * 1000,
);
const OFFLINE_GRACE_MS =
  Number(process.env.QR_OFFLINE_GRACE_SECONDS ?? 0) * 1000;
const MAX_CLOCK_SKEW_MS = 60_000;

function getPayloadSecret() {
  const secret = process.env.QR_PAYLOAD_SECRET ?? process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("QR_PAYLOAD_SECRET or SESSION_SECRET is required for QR signing");
  }
  return secret;
}

function signQrPayload(params: {
  roundId: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
}) {
  const secret = getPayloadSecret();
  const payload = `${params.roundId}.${params.token}.${params.issuedAt}.${params.expiresAt}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqualsHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

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
  issuedAt: string;
  expiresAt: string;
}) {
  const signature = signQrPayload({
    roundId: params.roundId,
    token: params.token,
    issuedAt: params.issuedAt,
    expiresAt: params.expiresAt,
  });

  return JSON.stringify({
    roundId: params.roundId,
    token: params.token,
    issuedAt: params.issuedAt,
    expiresAt: params.expiresAt,
    signature,
  });
}

export function verifyQrPayloadSignature(params: {
  roundId: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}) {
  const expected = signQrPayload({
    roundId: params.roundId,
    token: params.token,
    issuedAt: params.issuedAt,
    expiresAt: params.expiresAt,
  });
  return timingSafeEqualsHex(expected, params.signature);
}

export const qrService = {
  /**
   * Create a short-lived QR token for a round.
   */
  async generateToken(roundId: string, executor: DbExecutor = db) {
    const issuedAt = new Date().toISOString();
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
      issuedAt,
    };
  },

  /**
   * Validates a token and atomically consumes it to prevent reuse.
   * Throws ApiError with appropriate status codes on failure.
   */
  async validateAndConsumeToken(
    roundId: string,
    token: string,
    options?: {
      offlineCapturedAt?: string | null;
      qrSignature?: string | null;
      qrIssuedAt?: string | null;
      qrExpiresAt?: string | null;
    },
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

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const recordExpiresMs = new Date(record.expires_at).getTime();
    const isExpired = record.expires_at <= nowIso || recordExpiresMs < nowMs;
    if (isExpired) {
      const offlineCapturedAt = options?.offlineCapturedAt ?? null;
      const qrSignature = options?.qrSignature ?? null;
      const qrIssuedAt = options?.qrIssuedAt ?? null;
      const qrExpiresAt = options?.qrExpiresAt ?? null;

      if (!qrSignature || !qrIssuedAt || !qrExpiresAt) {
        throw new ApiError(400, "QR token has expired", "token_expired");
      }

      if (
        !verifyQrPayloadSignature({
          roundId,
          token,
          issuedAt: qrIssuedAt,
          expiresAt: qrExpiresAt,
          signature: qrSignature,
        })
      ) {
        throw new ApiError(400, "Invalid QR payload signature", "invalid_qr_signature");
      }

      const payloadIssuedMs = Date.parse(qrIssuedAt);
      const payloadExpiresMs = Date.parse(qrExpiresAt);
      if (
        Number.isNaN(payloadIssuedMs) ||
        Number.isNaN(payloadExpiresMs)
      ) {
        throw new ApiError(400, "Invalid QR payload timestamp", "invalid_qr_timestamp");
      }

      if (Math.abs(recordExpiresMs - payloadExpiresMs) > 2000) {
        throw new ApiError(400, "Invalid QR payload timestamp", "invalid_qr_timestamp");
      }

      if (payloadIssuedMs > payloadExpiresMs) {
        throw new ApiError(400, "Invalid QR payload timestamp", "invalid_qr_timestamp");
      }

      if (offlineCapturedAt) {
        const capturedMs = Date.parse(offlineCapturedAt);
        if (Number.isNaN(capturedMs)) {
          throw new ApiError(
            400,
            "Offline capture time is invalid",
            "invalid_offline_capture_time",
          );
        }

        if (capturedMs < payloadIssuedMs - MAX_CLOCK_SKEW_MS) {
          throw new ApiError(
            400,
            "Offline capture time is invalid",
            "invalid_offline_capture_time",
          );
        }

        if (capturedMs > nowMs + MAX_CLOCK_SKEW_MS) {
          throw new ApiError(
            400,
            "Offline capture time is invalid",
            "invalid_offline_capture_time",
          );
        }

        if (nowMs > payloadExpiresMs + OFFLINE_GRACE_MS + MAX_CLOCK_SKEW_MS) {
          throw new ApiError(400, "QR token has expired", "token_expired");
        }
      } else if (nowMs > payloadExpiresMs + MAX_CLOCK_SKEW_MS) {
        // Online scan tolerance for network/clock drift between devices.
        throw new ApiError(400, "QR token has expired", "token_expired");
      }
    }

    const [consumed] = await executor
      .update(qr_tokens)
      .set({ consumed: true })
      .where(
        isExpired
          ? and(eq(qr_tokens.id, record.id), eq(qr_tokens.consumed, false))
          : and(
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
