import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { adminPolicyController } from "../controllers/adminPolicyController";

export function registerAdminRoutes(parent: Router) {
  const router = Router();
  router.use(requireRole("admin"));

  router.get("/policies", adminPolicyController.list);
  router.post("/policies", adminPolicyController.create);
  router.patch("/policies/:policyId", adminPolicyController.update);
  router.post(
    "/policies/:policyId/assign/course/:courseId",
    adminPolicyController.assignToCourse,
  );

  parent.use("/admin", router);
}
