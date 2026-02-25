import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/auth";
import { enrollmentService } from "../services/enrollmentService";

const addEnrollmentSchema = z.union([
  z.object({ studentId: z.string().uuid() }),
  z.object({ username: z.string().min(1).max(120) }),
  z.object({ email: z.string().email() }),
]);

export function registerEnrollmentRoutes(parent: Router) {
  const router = Router();
  router.use(requireRole("professor"));

  router.get("/groups/:groupId/enrollments", async (req, res, next) => {
    try {
      const data = await enrollmentService.listGroupEnrollments(
        req.user!.id,
        req.params.groupId,
      );
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  router.post("/groups/:groupId/enrollments", async (req, res, next) => {
    try {
      const body = addEnrollmentSchema.parse(req.body ?? {});
      const result = await enrollmentService.addToGroup(
        req.user!.id,
        req.params.groupId,
        body,
      );
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/enrollments/:enrollmentId", async (req, res, next) => {
    try {
      await enrollmentService.removeEnrollment(req.user!.id, req.params.enrollmentId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  parent.use("/professor", router);
}
