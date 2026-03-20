import { db } from "../db";
import { audit_logs } from "@shared/schema";
import { logger } from "../utils/logger";

export type AuditParams = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

export const auditService = {
  async log(params: AuditParams) {
    try {
      await db.insert(audit_logs).values({
        actor_id: params.actorId ?? null,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId ?? null,
        before_json: params.before ? JSON.stringify(params.before) : null,
        after_json: params.after ? JSON.stringify(params.after) : null,
        reason: params.reason ?? null,
      });
    } catch (error) {
      logger.error("audit log insert failed", { error });
    }
  },
};
