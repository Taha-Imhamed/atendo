import { Request, Response, NextFunction } from "express";
import { attendanceService } from "../services/attendanceService";

export const attendanceController = {
  async scan(req: Request, res: Response, next: NextFunction) {
    try {
      const { roundId } = req.params;
      const {
        token,
        latitude,
        longitude,
        deviceFingerprint,
        client_scan_id,
        offlineCapturedAt,
      } = req.body;

      if (typeof token !== "string" || token.trim() === "") {
        return res.status(400).json({ message: "Token is required" });
      }

      const result = await attendanceService.recordScan(
        req.user!.id,
        roundId,
        token,
        latitude !== undefined && longitude !== undefined
          ? {
              latitude: Number(latitude),
              longitude: Number(longitude),
            }
          : null,
        typeof deviceFingerprint === "string" && deviceFingerprint.length > 0
          ? deviceFingerprint
          : null,
        typeof client_scan_id === "string" && client_scan_id.length > 0
          ? client_scan_id
          : null,
        typeof offlineCapturedAt === "string" && offlineCapturedAt.length > 0
          ? offlineCapturedAt
          : null,
      );

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },

  async getMyAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await attendanceService.getMyAttendance(req.user!.id);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },

  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const history = await attendanceService.getAttendanceHistory(req.user!.id);
      res.json({ history });
    } catch (error) {
      next(error);
    }
  },
};
