import express, { type Express } from "express";
import type { Server } from "http";
import { sql } from "drizzle-orm";
import { registerAuthRoutes } from "./routes/auth";
import { registerProfessorRoutes } from "./routes/professor";
import { registerStudentRoutes } from "./routes/student";
import { registerAdminRoutes } from "./routes/admin";
import { registerEnrollmentRoutes } from "./routes/enrollment";
import { db } from "./db";
import { users } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  const apiRouter = express.Router();
  app.use("/api", apiRouter);

  apiRouter.get("/health", async (_req, res) => {
    try {
      await db.select({ ok: sql<number>`1` }).from(users).limit(1);
      res.status(200).json({ status: "ok" });
    } catch (error) {
      res.status(500).json({ status: "error" });
    }
  });

  registerAuthRoutes(apiRouter);
  registerAdminRoutes(apiRouter);
  registerEnrollmentRoutes(apiRouter);
  registerProfessorRoutes(apiRouter);
  registerStudentRoutes(apiRouter);

  apiRouter.use((_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  return httpServer;
}
