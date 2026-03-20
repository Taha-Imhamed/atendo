import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  attendance_policies,
  attendance_policy_history,
  course_policy_assignments,
  courses,
  type AttendancePolicy,
  type PolicyScopeType,
} from "@shared/schema";
import { ApiError } from "../errors/apiError";
import { logger } from "../utils/logger";
import { auditService } from "./auditService";

export const policyRulesSchema = z.object({
  lateAfterMinutes: z.object({
    first_hour: z.number().min(0),
    break: z.number().min(0),
  }),
  graceMinutes: z.number().min(0).optional().default(0),
  maxAbsences: z.number().int().min(0).nullable().optional(),
});

export type AttendancePolicyRules = z.infer<typeof policyRulesSchema>;

export type ResolvedPolicy = {
  id?: string;
  scopeType: PolicyScopeType;
  scopeId: string | null;
  version: number;
  rules: AttendancePolicyRules;
  name?: string | null;
};

const DEFAULT_POLICY_RULES: AttendancePolicyRules = {
  lateAfterMinutes: {
    first_hour: 20,
    break: 10,
  },
  graceMinutes: 0,
  maxAbsences: null,
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { policy: ResolvedPolicy; expiresAt: number }>();

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

const cacheKey = (courseId?: string | null, facultyId?: string | null) =>
  `course:${courseId ?? "none"}|faculty:${facultyId ?? "none"}`;

function clearCacheMatching(predicate: (courseId: string | null, facultyId: string | null) => boolean) {
  for (const key of cache.keys()) {
    const [coursePart, facultyPart] = key.split("|");
    const courseId = coursePart?.replace("course:", "") || null;
    const facultyId = facultyPart?.replace("faculty:", "") || null;
    if (predicate(courseId === "none" ? null : courseId, facultyId === "none" ? null : facultyId)) {
      cache.delete(key);
    }
  }
}

async function seedDefaultGlobalPolicy(executor: DbExecutor = db) {
  const [existing] = await executor
    .select({ id: attendance_policies.id })
    .from(attendance_policies)
    .where(
      and(
        eq(attendance_policies.scope_type, "global"),
        eq(attendance_policies.is_active, true),
      ),
    )
    .limit(1);

  if (!existing) {
    const nowIso = new Date().toISOString();
    const [policy] = await executor
      .insert(attendance_policies)
      .values({
        name: "Global Default v1",
        scope_type: "global",
        scope_id: null,
        version: 1,
        rules_json: JSON.stringify(DEFAULT_POLICY_RULES),
        effective_from: nowIso,
        is_active: true,
        created_at: nowIso,
      })
      .returning();

    await executor.insert(attendance_policy_history).values({
      policy_id: policy.id,
      name: policy.name,
      scope_type: policy.scope_type as PolicyScopeType,
      scope_id: policy.scope_id,
      version: policy.version,
      rules_json: policy.rules_json,
      effective_from: policy.effective_from,
      is_active: policy.is_active,
    });

    logger.info("seeded default global attendance policy", { policyId: policy.id });
  }
}

function parseRules(raw: string): AttendancePolicyRules {
  try {
    const parsed = JSON.parse(raw);
    return policyRulesSchema.parse(parsed);
  } catch (error) {
    logger.warn("invalid policy rules, falling back to default", { error });
    return DEFAULT_POLICY_RULES;
  }
}

function toResolvedPolicy(policy?: AttendancePolicy | null): ResolvedPolicy {
  if (!policy) {
    return {
      scopeType: "global",
      scopeId: null,
      version: 1,
      rules: DEFAULT_POLICY_RULES,
      name: "Global Default v1",
    };
  }

  return {
    id: policy.id,
    scopeType: policy.scope_type as PolicyScopeType,
    scopeId: policy.scope_id ?? null,
    version: policy.version,
    rules: parseRules(policy.rules_json),
    name: policy.name,
  };
}

async function findCoursePolicy(courseId: string, nowIso: string, executor: DbExecutor) {
  const [row] = await executor
    .select({ policy: attendance_policies })
    .from(course_policy_assignments)
    .innerJoin(
      attendance_policies,
      eq(course_policy_assignments.policy_id, attendance_policies.id),
    )
    .where(
      and(
        eq(course_policy_assignments.course_id, courseId),
        eq(attendance_policies.is_active, true),
        lte(attendance_policies.effective_from, nowIso),
      ),
    )
    .orderBy(desc(attendance_policies.version), desc(attendance_policies.effective_from))
    .limit(1);

  return row?.policy ?? null;
}

async function findFacultyPolicy(facultyId: string, nowIso: string, executor: DbExecutor) {
  const [row] = await executor
    .select()
    .from(attendance_policies)
    .where(
      and(
        eq(attendance_policies.scope_type, "faculty"),
        eq(attendance_policies.scope_id, facultyId),
        eq(attendance_policies.is_active, true),
        lte(attendance_policies.effective_from, nowIso),
      ),
    )
    .orderBy(desc(attendance_policies.version), desc(attendance_policies.effective_from))
    .limit(1);

  return row ?? null;
}

async function findGlobalPolicy(nowIso: string, executor: DbExecutor) {
  const [row] = await executor
    .select()
    .from(attendance_policies)
    .where(
      and(
        eq(attendance_policies.scope_type, "global"),
        eq(attendance_policies.is_active, true),
        lte(attendance_policies.effective_from, nowIso),
      ),
    )
    .orderBy(desc(attendance_policies.version), desc(attendance_policies.effective_from))
    .limit(1);

  return row ?? null;
}

export const policyService = {
  DEFAULT_POLICY_RULES,

  async getActivePolicyForRound(courseId?: string | null, facultyId?: string | null) {
    await seedDefaultGlobalPolicy();
    const key = cacheKey(courseId, facultyId);
    const nowMs = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > nowMs) {
      return cached.policy;
    }

    const nowIso = new Date(nowMs).toISOString();
    let policy: AttendancePolicy | null = null;

    if (courseId) {
      policy = await findCoursePolicy(courseId, nowIso, db);
    }

    if (!policy && facultyId) {
      policy = await findFacultyPolicy(facultyId, nowIso, db);
    }

    if (!policy) {
      policy = await findGlobalPolicy(nowIso, db);
    }

    const resolved = toResolvedPolicy(policy);
    cache.set(key, { policy: resolved, expiresAt: nowMs + CACHE_TTL_MS });
    return resolved;
  },

  async createPolicy(input: {
    name?: string | null;
    scopeType: PolicyScopeType;
    scopeId?: string | null;
    rules: AttendancePolicyRules;
    effectiveFrom?: string;
    isActive?: boolean;
    createdBy?: string | null;
  }) {
    if (input.scopeType !== "global" && !input.scopeId) {
      throw new ApiError(400, "scopeId is required for course or faculty policies");
    }

    const rules = policyRulesSchema.parse(input.rules);
    const scopeMatch =
      input.scopeType === "global"
        ? sql`${attendance_policies.scope_id} IS NULL`
        : eq(attendance_policies.scope_id, input.scopeId!);

    const [{ maxVersion }] = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${attendance_policies.version}), 0)` })
      .from(attendance_policies)
      .where(and(eq(attendance_policies.scope_type, input.scopeType), scopeMatch));

    const version = (maxVersion ?? 0) + 1;
    const effectiveFrom = input.effectiveFrom ?? new Date().toISOString();

    const [policy] = await db
      .insert(attendance_policies)
      .values({
        name: input.name ?? null,
        scope_type: input.scopeType,
        scope_id: input.scopeType === "global" ? null : input.scopeId!,
        version,
        rules_json: JSON.stringify(rules),
        effective_from: effectiveFrom,
        is_active: input.isActive ?? true,
        created_by: input.createdBy ?? null,
      })
      .returning();

    await db.insert(attendance_policy_history).values({
      policy_id: policy.id,
      name: policy.name,
      scope_type: policy.scope_type as PolicyScopeType,
      scope_id: policy.scope_id,
      version: policy.version,
      rules_json: policy.rules_json,
      effective_from: policy.effective_from,
      is_active: policy.is_active,
    });

    if (policy.scope_type === "global") {
      cache.clear();
    } else if (policy.scope_type === "faculty") {
      clearCacheMatching((_, faculty) => faculty === policy.scope_id);
    } else if (policy.scope_type === "course") {
      clearCacheMatching((course) => course === policy.scope_id);
    }

    await auditService.log({
      actorId: input.createdBy ?? null,
      action: "policy_create",
      entityType: "attendance_policy",
      entityId: policy.id,
      after: policy,
    });

    return policy;
  },

  async listPolicies() {
    return db
      .select()
      .from(attendance_policies)
      .orderBy(desc(attendance_policies.effective_from), desc(attendance_policies.version));
  },

  async updatePolicyActiveState(policyId: string, isActive: boolean) {
    const [current] = await db
      .select()
      .from(attendance_policies)
      .where(eq(attendance_policies.id, policyId))
      .limit(1);

    if (!current) {
      throw new ApiError(404, "Policy not found");
    }

    await db.insert(attendance_policy_history).values({
      policy_id: current.id,
      name: current.name,
      scope_type: current.scope_type as PolicyScopeType,
      scope_id: current.scope_id,
      version: current.version,
      rules_json: current.rules_json,
      effective_from: current.effective_from,
      is_active: current.is_active,
    });

    const [updated] = await db
      .update(attendance_policies)
      .set({ is_active: isActive })
      .where(eq(attendance_policies.id, policyId))
      .returning();

    if (updated.scope_type === "global") {
      cache.clear();
    } else if (updated.scope_type === "faculty") {
      clearCacheMatching((_, faculty) => faculty === updated.scope_id);
    } else if (updated.scope_type === "course") {
      clearCacheMatching((course) => course === updated.scope_id);
    }

    await auditService.log({
      actorId: current.created_by ?? null,
      action: isActive ? "policy_activate" : "policy_deactivate",
      entityType: "attendance_policy",
      entityId: policyId,
      before: current,
      after: updated,
    });

    return updated;
  },

  async assignPolicyToCourse(policyId: string, courseId: string) {
    const [policy] = await db
      .select()
      .from(attendance_policies)
      .where(eq(attendance_policies.id, policyId))
      .limit(1);

    if (!policy) {
      throw new ApiError(404, "Policy not found");
    }

    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new ApiError(404, "Course not found");
    }

    await db
      .insert(course_policy_assignments)
      .values({ course_id: courseId, policy_id: policyId })
      .onConflictDoUpdate({
        target: course_policy_assignments.course_id,
        set: {
          policy_id: policyId,
          assigned_at: new Date().toISOString(),
        },
      });

    clearCacheMatching((course) => course === courseId);

    await auditService.log({
      actorId: course.professor_id,
      action: "policy_assign_course",
      entityType: "course",
      entityId: courseId,
      after: { policyId, courseId },
    });

    return { policy, course };
  },
};
