import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { attendance_rounds } from "@shared/schema";
import { buildQrPayload, qrService } from "./qrService";
import {
  emitRoundStarted,
  emitRoundQrUpdated,
} from "../websocket/manager";

export const roundService = {
  /**
   * Creates a new round for the session, closing any active round and emitting events.
   */
  async createRound(
    sessionId: string,
    options?: {
      geofenceEnabled?: boolean;
      latitude?: number | null;
      longitude?: number | null;
      geofenceRadiusM?: number | null;
      isBreakRound?: boolean;
    },
  ) {
    const [{ max: currentMax }] = await db
      .select({
        max: sql<number>`COALESCE(MAX(${attendance_rounds.round_number}), 0)`,
      })
      .from(attendance_rounds)
      .where(eq(attendance_rounds.session_id, sessionId));

    const nextRoundNumber = (currentMax ?? 0) + 1;

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

    const [round] = await db
      .insert(attendance_rounds)
      .values({
        session_id: sessionId,
        round_number: nextRoundNumber,
        starts_at: new Date().toISOString(),
        is_active: true,
        geofence_enabled: options?.geofenceEnabled ?? false,
        geofence_radius_m: options?.geofenceRadiusM ?? null,
        latitude: options?.latitude ?? null,
        longitude: options?.longitude ?? null,
        is_break_round: options?.isBreakRound ?? false,
      })
      .returning();

    const token = await qrService.generateToken(round.id);
    const qrPayload = buildQrPayload({
      roundId: round.id,
      token: token.rawToken,
      sessionId,
      geofenceEnabled: round.geofence_enabled,
      geofenceRadiusM: round.geofence_radius_m,
      latitude: round.latitude,
      longitude: round.longitude,
      isBreakRound: round.is_break_round,
    });

    emitRoundStarted(sessionId, {
      sessionId,
      roundId: round.id,
      roundNumber: round.round_number,
      startsAt: new Date(round.starts_at).toISOString(),
    });

    emitRoundQrUpdated(sessionId, {
      sessionId,
      roundId: round.id,
      token: token.rawToken,
      expiresAt: token.expiresAt.toISOString(),
      qrPayload,
    });

    return { round, token, qrPayload };
  },

  /** Retrieves a round by id, returning null if not found. */
  async getActiveRound(roundId: string) {
    const [round] = await db
      .select()
      .from(attendance_rounds)
      .where(eq(attendance_rounds.id, roundId))
      .limit(1);

    return round;
  },
};
