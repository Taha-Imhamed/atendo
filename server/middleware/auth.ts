import type { RequestHandler } from "express";
import { type UserRole } from "@shared/schema";

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  res.status(401).json({ message: "Authentication required" });
};

export const requireRole =
  (role: UserRole): RequestHandler =>
  (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!req.user) {
      return res.status(403).json({
        message: `Insufficient permissions. Required role: ${role}, your role: none`,
      });
    }

    if (req.user.role === "admin") {
      return next();
    }

    if (req.user.role !== role) {
      return res.status(403).json({
        message: `Insufficient permissions. Required role: ${role}, your role: ${req.user.role}`,
      });
    }

    return next();
  };
