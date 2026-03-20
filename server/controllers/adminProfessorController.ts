import type { Request, Response } from "express";
import { z } from "zod";
import { adminProfessorService } from "../services/adminProfessorService";
import { authService } from "../services/authService";

const deleteSchema = z.object({
  professorId: z.string().min(1),
});

const resetSchema = z.object({
  professorId: z.string().min(1),
  password: z.string().optional(),
});

export const adminProfessorController = {
  async list(_req: Request, res: Response) {
    const professors = await adminProfessorService.listProfessors();
    res.json({ professors });
  },

  async remove(req: Request, res: Response) {
    const params = deleteSchema.parse({ professorId: req.params.professorId });
    const result = await adminProfessorService.deleteProfessor(
      req.user!.id,
      params.professorId,
    );
    res.json(result);
  },

  async resetPassword(req: Request, res: Response) {
    const body = resetSchema.parse({
      professorId: req.params.professorId,
      password: typeof req.body?.password === "string" ? req.body.password : undefined,
    });
    const result = await authService.resetProfessorPasswordByAdmin(
      req.user!.id,
      body.professorId,
      body.password,
    );
    res.json(result);
  },
};
