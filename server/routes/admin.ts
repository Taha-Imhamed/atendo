import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { adminPolicyController } from "../controllers/adminPolicyController";
import { adminProfessorController } from "../controllers/adminProfessorController";

export function registerAdminRoutes(parent: Router) {
  const router = Router();
  router.use(requireRole("admin"));

  router.get("/professors", adminProfessorController.list);
  router.delete("/professors/:professorId", adminProfessorController.remove);
  router.patch(
    "/professors/:professorId/password",
    adminProfessorController.resetPassword,
  );

  router.get("/policies", adminPolicyController.list);
  router.post("/policies", adminPolicyController.create);
  router.patch("/policies/:policyId", adminPolicyController.update);
  router.post(
    "/policies/:policyId/assign/course/:courseId",
    adminPolicyController.assignToCourse,
  );

  parent.use("/admin", router);
}
