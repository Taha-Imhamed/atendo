import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { professorController } from "../controllers/professorController";
import { excuseController } from "../controllers/excuseController";
import { rosterUpload } from "../middleware/uploads";

export function registerProfessorRoutes(parent: Router) {
  const router = Router();
  router.use(requireRole("professor"));

  router.get("/courses", professorController.listCourses);
  router.post("/courses", professorController.createCourse);
  router.post("/courses/:courseId/groups", professorController.createGroup);

  router.post("/groups/:groupId/sessions", professorController.startSession);
  router.post("/sessions/:sessionId/rounds", professorController.startRound);
  router.patch(
    "/sessions/:sessionId/rounds/:roundId/end",
    professorController.endRound,
  );
  router.patch("/sessions/:sessionId/end", professorController.endSession);
  router.get("/sessions/:sessionId", professorController.getSessionDetail);
  router.get("/sessions/:sessionId/stats", professorController.getSessionStats);
  router.get("/sessions/:sessionId/export", professorController.exportSession);
  router.get("/sessions/:sessionId/excuses", excuseController.listForSession);
  router.patch("/excuses/:excuseId/approve", professorController.approveExcuse);
  router.patch("/excuses/:excuseId/reject", professorController.rejectExcuse);
  router.get("/excuses/:excuseId/attachment", excuseController.downloadAttachment);
  router.get("/sessions/:sessionId/analytics", professorController.getSessionAnalytics);
  router.get(
    "/sessions/:sessionId/analytics/export",
    professorController.exportSessionAnalytics,
  );
  router.post("/users", professorController.createUserAccount);
  router.get("/users", professorController.listManagedUsers);
  router.get(
    "/reports/accounts/export",
    professorController.exportManagedAccounts,
  );
  router.get(
    "/reports/attendance/export",
    professorController.exportAttendancePeriodReport,
  );
  router.patch("/users/:userId", professorController.updateManagedUser);
  router.post(
    "/roster-files",
    rosterUpload.single("sheet"),
    professorController.uploadRosterFile,
  );
  router.post(
    "/roster-files/import",
    rosterUpload.single("sheet"),
    professorController.importRosterAccounts,
  );
  router.get("/roster-files", professorController.listRosterFiles);
  router.get(
    "/roster-files/:fileName",
    professorController.downloadRosterFile,
  );
  router.patch(
    "/users/:studentId/password",
    professorController.resetStudentPassword,
  );

  parent.use("/professor", router);
}
