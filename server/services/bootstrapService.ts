import { authService } from "./authService";
import { userRepository } from "../repositories/userRepository";
import { logger } from "../utils/logger";
function enabled(value: string | undefined) {
  return value === "1" || value === "true";
}

function shouldSyncExistingUsers() {
  return enabled(process.env.BOOTSTRAP_SYNC_USERS);
}

function readUserConfig(prefix: "PROFESSOR" | "STUDENT" | "ADMIN") {
  const username = process.env[`${prefix}_USERNAME`];
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  const display_name =
    process.env[`${prefix}_DISPLAY_NAME`] ??
    (prefix === "PROFESSOR"
      ? "Professor"
      : prefix === "STUDENT"
        ? "Student"
        : "Admin");

  if (!username || !email || !password) {
    return null;
  }

  const role =
    prefix === "PROFESSOR" ? "professor" : prefix === "STUDENT" ? "student" : "admin";

  return { username, email, password, display_name, role };
}

async function ensureUser(
  user: {
    username: string;
    email: string;
    password: string;
    display_name: string;
    role: "professor" | "student" | "admin";
  },
) {
  const byUsername = await userRepository.findByUsername(user.username);
  const byEmail = await userRepository.findByEmail(user.email);
  const existing = byUsername ?? byEmail;
  if (existing) {
    if (shouldSyncExistingUsers()) {
      const hashed = authService.hashPassword(user.password);
      await userRepository.syncBootstrapUser(existing.id, {
        email: user.email,
        username: user.username,
        display_name: user.display_name,
        password: hashed,
        role: user.role,
      });
      logger.info("Bootstrap user synced", {
        username: user.username,
        role: user.role,
      });
    } else {
      logger.info("Bootstrap user already exists (no sync)", {
        username: user.username,
        role: user.role,
      });
    }
    return;
  }

  await authService.registerUser({
    email: user.email,
    username: user.username,
    display_name: user.display_name,
    password: user.password,
    role: user.role,
  });

  logger.info("Bootstrap user created", { username: user.username, role: user.role });
}

export async function bootstrapUsersFromEnv() {
  const masterUsername = process.env.MASTER_ADMIN_USERNAME ?? "masteradmin";
  const masterEmail = process.env.MASTER_ADMIN_EMAIL ?? "masteradmin@unyt.edu.al";
  const masterPassword = process.env.MASTER_ADMIN_PASSWORD ?? "memoadmin";
  const masterDisplayName =
    process.env.MASTER_ADMIN_DISPLAY_NAME ?? "Master Admin";

  if (masterUsername && masterEmail && masterPassword) {
    await ensureUser({
      username: masterUsername,
      email: masterEmail,
      password: masterPassword,
      display_name: masterDisplayName,
      role: "admin",
    });
  }

  if (!enabled(process.env.AUTO_BOOTSTRAP_USERS)) {
    return;
  }

  const users = [
    readUserConfig("PROFESSOR"),
    readUserConfig("STUDENT"),
    readUserConfig("ADMIN"),
  ].filter(Boolean) as Array<{
    username: string;
    email: string;
    password: string;
    display_name: string;
    role: "professor" | "student" | "admin";
  }>;

  for (const user of users) {
    await ensureUser(user);
  }
}
