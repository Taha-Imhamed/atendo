import { Router } from "express";
import type { Express } from "express";
import passport from "passport";
import { requireAuth } from "../middleware/auth";
import { loginRateLimiter } from "../middleware/rateLimit";
import { authService } from "../services/authService";

export function registerAuthRoutes(parent: Router) {
  const router = Router();

  router.post("/login", loginRateLimiter, (req, res, next) => {
    passport.authenticate(
      "local",
      (
        err: Error | null,
        user: Express.User | false | undefined,
        info: { message?: string } | undefined,
      ) => {
        if (err) {
          return next(err);
        }

        if (!user) {
          return res
            .status(401)
            .json({ message: info?.message ?? "Invalid credentials" });
        }

        req.logIn(user, (loginErr) => {
          if (loginErr) {
            return next(loginErr);
          }

          return res.json({
            id: user.id,
            email: user.email,
            username: user.username,
            display_name: user.display_name,
            role: user.role,
            must_change_password: user.must_change_password,
          });
        });
      },
    )(req, res, next);
  });

  router.post("/logout", requireAuth, (req, res) => {
    req.logout(() => {
      res.json({ message: "Logged out" });
    });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({
      id: req.user!.id,
      email: req.user!.email,
      username: req.user!.username,
      display_name: req.user!.display_name,
      role: req.user!.role,
      must_change_password: req.user!.must_change_password,
    });
  });

  router.post("/change-password", requireAuth, async (req, res, next) => {
    try {
      const currentPassword =
        typeof req.body?.currentPassword === "string"
          ? req.body.currentPassword
          : "";
      const newPassword =
        typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

      await authService.changeOwnPassword(
        req.user!.id,
        currentPassword,
        newPassword,
      );
      res.json({ message: "Password updated." });
    } catch (error) {
      next(error);
    }
  });

  parent.use("/auth", router);
}
