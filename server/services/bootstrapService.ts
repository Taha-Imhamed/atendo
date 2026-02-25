import { authService } from "./authService";
import { userRepository } from "../repositories/userRepository";
import { logger } from "../utils/logger";
function enabled(value: string | undefined) {
  return value === "1" || value === "true";
}

function readUserConfig(prefix: "PROFESSOR" | "STUDENT") {
  const username = process.env[`${prefix}_USERNAME`];
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  const display_name =
    process.env[`${prefix}_DISPLAY_NAME`] ??
    (prefix === "PROFESSOR" ? "Professor" : "Student");

  if (!username || !email || !password) {
    return null;
  }

  const role = prefix === "PROFESSOR" ? "professor" : "student";

  return { username, email, password, display_name, role };
}

async function ensureUser(
  user: {
    username: string;
    email: string;
    password: string;
    display_name: string;
    role: "professor" | "student";
  },
) {
  const byUsername = await userRepository.findByUsername(user.username);
  const byEmail = await userRepository.findByEmail(user.email);
  const existing = byUsername ?? byEmail;
  if (existing) {
    const hashed = authService.hashPassword(user.password);
    await userRepository.syncBootstrapUser(existing.id, {
      email: user.email,
      username: user.username,
      display_name: user.display_name,
      password: hashed,
      role: user.role,
    });
    logger.info("Bootstrap user already exists", {
      username: user.username,
      role: user.role,
    });
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
  if (!enabled(process.env.AUTO_BOOTSTRAP_USERS)) {
    return;
  }

  const users = [
    readUserConfig("PROFESSOR"),
    readUserConfig("STUDENT"),
  ].filter(Boolean) as Array<{
    username: string;
    email: string;
    password: string;
    display_name: string;
    role: "professor" | "student";
  }>;

  for (const user of users) {
    await ensureUser(user);
  }
}
