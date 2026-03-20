import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Express } from "express";
import type { UserRole } from "@shared/schema";
import { authService } from "../services/authService";
import { userRepository } from "../repositories/userRepository";

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await authService.validateUser(username, password);
      if (!user) {
        return done(null, false, { message: "Invalid credentials" });
      }

      const sessionUser: Express.User = {
        id: user.id,
        email: user.email,
        username: user.username,
        display_name: user.display_name,
        role: user.role as UserRole,
        must_change_password: user.must_change_password,
      };

      return done(null, sessionUser);
    } catch (error) {
      return done(error);
    }
  }),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await userRepository.findById(id);
    if (!user) {
      return done(null, false);
    }

    return done(null, {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      username: user.username,
      display_name: user.display_name,
      must_change_password: user.must_change_password,
    });
  } catch (error) {
    return done(error);
  }
});
