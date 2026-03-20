import { type NextFunction, type Request, type Response } from "express";
import { excuseService } from "../services/excuseService";
import { excuseUploadDir } from "../middleware/uploads";
import path from "path";
import fs from "fs";

export const excuseController = {
  async submit(req: Request, res: Response, next: NextFunction) {
    try {
      const { attendanceRoundId, reason, category } = req.body;
      const attachmentPath = (req as any).file?.path ?? null;
      const excuse = await excuseService.submitExcuse(req.user!.id, {
        roundId: attendanceRoundId,
        reason,
        category,
        attachmentPath,
      });
      res.status(201).json(excuse);
    } catch (error) {
      next(error);
    }
  },

  async listMine(req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await excuseService.listStudentExcuses(req.user!.id);
      res.json({ excuses: rows });
    } catch (error) {
      next(error);
    }
  },

  async listForSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      const { status } = req.query;
      const rows = await excuseService.listSessionExcuses(
        req.user!.id,
        sessionId,
        typeof status === "string" ? status : undefined,
      );
      res.json({ excuses: rows });
    } catch (error) {
      next(error);
    }
  },

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await excuseService.reviewExcuse(
        req.user!.id,
        req.params.excuseId,
        "approve",
        req.body?.note,
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  async reject(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await excuseService.reviewExcuse(
        req.user!.id,
        req.params.excuseId,
        "reject",
        req.body?.note,
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  async downloadAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const filePath = await excuseService.getAttachmentPathForAuthorizedUser(
        req.user!.id,
        req.user!.role,
        req.params.excuseId,
      );
      const resolved = path.resolve(filePath.startsWith("/") ? filePath : path.join(excuseUploadDir, path.basename(filePath)));
      if (!fs.existsSync(resolved)) {
        return res.status(404).json({ message: "File not found" });
      }
      res.sendFile(resolved);
    } catch (error) {
      next(error);
    }
  },
};
