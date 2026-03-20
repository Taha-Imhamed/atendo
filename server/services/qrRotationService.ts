import { and, eq } from "drizzle-orm";
import { attendance_rounds, sessions } from "@shared/schema";
import { db } from "../db";
import { logger } from "../utils/logger";
import { buildQrPayload, qrService } from "./qrService";
import { emitRoundQrUpdated } from "../websocket/manager";

const QR_ROTATION_INTERVAL_MS = Math.max(
  5_000,
  Number(process.env.QR_ROTATION_INTERVAL_SECONDS ?? 5) * 1000,
);

async function rotateActiveRound(roundId: string, sessionId: string) {
  const token = await qrService.generateToken(roundId);
  const expiresAtIso = token.expiresAt.toISOString();
  const qrPayload = buildQrPayload({
    roundId,
    token: token.rawToken,
    issuedAt: token.issuedAt,
    expiresAt: expiresAtIso,
  });

  emitRoundQrUpdated(sessionId, {
    sessionId,
    roundId,
    token: token.rawToken,
    expiresAt: expiresAtIso,
    qrPayload,
  });
}

export async function rotateActiveRoundQrCodes() {
  const activeRounds = await db
    .select({
      roundId: attendance_rounds.id,
      sessionId: attendance_rounds.session_id,
    })
    .from(attendance_rounds)
    .innerJoin(sessions, eq(attendance_rounds.session_id, sessions.id))
    .where(
      and(
        eq(attendance_rounds.is_active, true),
        eq(sessions.is_active, true),
      ),
    );

  await Promise.all(
    activeRounds.map(async ({ roundId, sessionId }) => {
      try {
        await rotateActiveRound(roundId, sessionId);
      } catch (error) {
        logger.error("Failed to rotate QR code for active round", {
          roundId,
          sessionId,
          error,
        });
      }
    }),
  );
}

export function startQrRotationScheduler() {
  setInterval(() => {
    rotateActiveRoundQrCodes().catch((error) => {
      logger.error("Failed to rotate active QR codes", { error });
    });
  }, QR_ROTATION_INTERVAL_MS);
}
