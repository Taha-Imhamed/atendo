import { Request, Response, NextFunction } from "express";
import { studentService } from "../services/studentService";
import { attendanceService } from "../services/attendanceService";

export const studentController = {
  async getEnrollments(req: Request, res: Response, next: NextFunction) {
    try {
      const enrollments = await studentService.getEnrollments(req.user!.id);
      res.json({ enrollments });
    } catch (error) {
      next(error);
    }
  },

  async getMyAttendance(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await attendanceService.getMyAttendance(req.user!.id);
      res.json({ attendance: stats });
    } catch (error) {
      next(error);
    }
  },
};
