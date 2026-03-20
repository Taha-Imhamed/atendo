import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { attendanceController } from "../controllers/attendanceController";
import { studentController } from "../controllers/studentController";
import { scanRateLimiter } from "../middleware/rateLimit";
import { excuseController } from "../controllers/excuseController";
import { excuseUpload } from "../middleware/uploads";

export function registerStudentRoutes(parent: Router) {
  const router = Router();
  router.use("/rounds", requireRole("student"));
  router.use("/me", requireRole("student"));

  router.post(
    "/rounds/:roundId/scans",
    scanRateLimiter,
    attendanceController.scan,
  );
  router.get("/me/attendance", studentController.getMyAttendance);
  router.get("/me/attendance/history", attendanceController.getHistory);
  router.get("/me/enrollments", studentController.getEnrollments);
  router.post(
    "/me/excuses",
    excuseUpload.single("attachment"),
    excuseController.submit,
  );
  router.get("/me/excuses", excuseController.listMine);
  router.get(
    "/me/excuses/:excuseId/attachment",
    excuseController.downloadAttachment,
  );

  parent.use("/", router);
}
