import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { userRepository } from "../repositories/userRepository";
import { ApiError } from "../errors/apiError";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  courses,
  enrollments,
  professor_profiles,
  student_profiles,
} from "@shared/schema";
import { accountCredentialService } from "./accountCredentialService";

const KEY_LENGTH = 64;

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, hashed: string) {
  const [salt, derived] = hashed.split(":");
  if (!salt || !derived) {
    return false;
  }

  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const stored = Buffer.from(derived, "hex");
  return timingSafeEqual(candidate, stored);
}

function validateNewPassword(password: string) {
  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters.");
  }
}

function generateRandomPassword(length = 12) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i += 1) {
    password += alphabet[bytes[i] % alphabet.length];
  }
  return password;
}

export const authService = {
  /** Hash a plaintext password with a random salt. */
  hashPassword,
  generateRandomPassword,

  /**
   * Validates a username/password combination and returns the user on success.
   */
  async validateUser(username: string, password: string) {
    const user = await userRepository.findByUsername(username);
    if (!user) {
      return null;
    }

    if (!verifyPassword(password, user.password)) {
      return null;
    }

    return user;
  },

  /**
   * Registers a new user with a securely hashed password.
   */
  async registerUser(data: {
    email: string;
    username: string;
    display_name: string;
    password: string;
    created_by_professor_id?: string;
    must_change_password?: boolean;
    role: "professor" | "student";
  }) {
    validateNewPassword(data.password);
    const hashed = hashPassword(data.password);
    const user = await userRepository.createUser({
      ...data,
      password: hashed,
    });

    if (user.role === "professor") {
      await db.insert(professor_profiles).values({
        user_id: user.id,
      });
    }
    if (user.role === "student") {
      await db.insert(student_profiles).values({
        user_id: user.id,
        created_by_professor_id: data.created_by_professor_id ?? null,
      });
    }

    return user;
  },

  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    nextPassword: string,
  ) {
    validateNewPassword(nextPassword);

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found.");
    }
    if (!verifyPassword(currentPassword, user.password)) {
      throw new ApiError(400, "Current password is incorrect.");
    }

    const nextHash = hashPassword(nextPassword);
    const updated = await userRepository.updatePassword(userId, nextHash);
    await accountCredentialService.deactivateForStudent(userId);
    return updated;
  },

  async resetStudentPasswordByProfessor(
    professorId: string,
    studentId: string,
    password?: string,
  ) {
    const student = await userRepository.findById(studentId);
    if (!student || student.role !== "student") {
      throw new ApiError(404, "Student not found.");
    }

    const [linkedEnrollment] = await db
      .select({ enrollmentId: enrollments.id })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.course_id))
      .where(
        and(
          eq(enrollments.student_id, studentId),
          eq(courses.professor_id, professorId),
        ),
      )
      .limit(1);

    const isCreator = student.created_by_professor_id === professorId;
    if (!isCreator && !linkedEnrollment) {
      throw new ApiError(
        403,
        "You can only reset passwords for your own or enrolled students.",
      );
    }

    const nextPassword = (password ?? generateRandomPassword()).trim();
    validateNewPassword(nextPassword);

    const nextHash = hashPassword(nextPassword);
    await userRepository.updatePasswordWithForceFlag(studentId, nextHash, true);
    await accountCredentialService.recordCredential(
      professorId,
      studentId,
      nextPassword,
      "reset",
    );

    return { temporaryPassword: nextPassword };
  },
};
