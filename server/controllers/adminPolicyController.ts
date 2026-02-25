import type { Request, Response } from "express";
import { z } from "zod";
import { policyRulesSchema, policyService } from "../services/policyService";

const createSchema = z.object({
  name: z.string().max(120).optional(),
  scopeType: z.enum(["global", "faculty", "course"]),
  scopeId: z.string().optional(),
  effectiveFrom: z.string().datetime().optional(),
  rules: policyRulesSchema,
});

const updateSchema = z.object({
  isActive: z.boolean().optional(),
});

const assignSchema = z.object({
  courseId: z.string(),
});

export const adminPolicyController = {
  async list(_req: Request, res: Response) {
    const policies = await policyService.listPolicies();
    res.json({ policies });
  },

  async create(req: Request, res: Response) {
    const body = createSchema.parse(req.body ?? {});
    if (body.scopeType !== "global" && !body.scopeId) {
      return res
        .status(400)
        .json({ message: "scopeId is required for course or faculty policies" });
    }

    const policy = await policyService.createPolicy({
      name: body.name,
      scopeType: body.scopeType,
      scopeId: body.scopeId ?? null,
      rules: body.rules,
      effectiveFrom: body.effectiveFrom,
      createdBy: req.user?.id,
    });
    res.status(201).json({ policy });
  },

  async update(req: Request, res: Response) {
    const body = updateSchema.parse(req.body ?? {});
    if (body.isActive === undefined) {
      return res.status(400).json({ message: "isActive is required" });
    }
    const policy = await policyService.updatePolicyActiveState(
      req.params.policyId,
      body.isActive,
    );
    res.json({ policy });
  },

  async assignToCourse(req: Request, res: Response) {
    const params = assignSchema.parse({ courseId: req.params.courseId });
    const { policy } = await policyService.assignPolicyToCourse(
      req.params.policyId,
      params.courseId,
    );
    res.json({ policyId: policy.id, courseId: params.courseId });
  },
};
