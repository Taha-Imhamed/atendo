import { db } from "../db";
import { fraud_signals } from "@shared/schema";
import { logger } from "../utils/logger";

export type FraudSignalParams = {
  type: string;
  severity: "low" | "medium" | "high";
  sessionId?: string | null;
  roundId?: string | null;
  studentId?: string | null;
  details?: Record<string, unknown>;
};

export const fraudService = {
  async emit(params: FraudSignalParams) {
    try {
      await db.insert(fraud_signals).values({
        type: params.type,
        severity: params.severity,
        session_id: params.sessionId ?? null,
        round_id: params.roundId ?? null,
        student_id: params.studentId ?? null,
        details_json: params.details ? JSON.stringify(params.details) : null,
      });
      logger.warn("fraud signal", {
        type: params.type,
        severity: params.severity,
        sessionId: params.sessionId,
        roundId: params.roundId,
        studentId: params.studentId,
        details: params.details,
      });
    } catch (error) {
      logger.error("failed to emit fraud signal", { error });
    }
  },
};
