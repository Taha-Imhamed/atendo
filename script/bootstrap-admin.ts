import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../server/db/index";
import { users } from "@shared/schema";
import { authService } from "../server/services/authService";
import { userRepository } from "../server/repositories/userRepository";
import { logger } from "../server/utils/logger";

function readArg(name: string) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function usage() {
  return [
    "Usage:",
    "  npx tsx script/bootstrap-admin.ts --username <username> --email <email> --password <password> [--display-name <name>]",
    "",
    "Or via env vars:",
    "  ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_DISPLAY_NAME",
  ].join("\n");
}

async function main() {
  const username = readArg("username") ?? process.env.ADMIN_USERNAME;
  const email = readArg("email") ?? process.env.ADMIN_EMAIL;
  const password = readArg("password") ?? process.env.ADMIN_PASSWORD;
  const displayName =
    readArg("display-name") ??
    readArg("displayName") ??
    process.env.ADMIN_DISPLAY_NAME ??
    "Admin";

  if (!username || !email) {
    console.error(usage());
    process.exit(1);
  }

  if (!password) {
    console.error("Missing admin password.\n\n" + usage());
    process.exit(1);
  }

  const existingByUsername = await userRepository.findByUsername(username);
  const existingByEmail = await userRepository.findByEmail(email);

  if (
    existingByUsername &&
    existingByEmail &&
    existingByUsername.id !== existingByEmail.id
  ) {
    console.error(
      `Conflict: username '${username}' belongs to a different user than email '${email}'.`,
    );
    process.exit(1);
  }

  const existing = existingByUsername ?? existingByEmail;
  const hashedPassword = authService.hashPassword(password);

  if (!existing) {
    const user = await userRepository.createUser({
      role: "admin",
      username,
      email,
      display_name: displayName,
      password: hashedPassword,
    });

    logger.info("Admin bootstrap complete (created)", {
      userId: user.id,
      username: user.username,
    });
    return;
  }

  const [updated] = await db
    .update(users)
    .set({
      role: "admin",
      username,
      email,
      display_name: displayName,
      password: hashedPassword,
    })
    .where(eq(users.id, existing.id))
    .returning();

  logger.info("Admin bootstrap complete (updated)", {
    userId: updated.id,
    username: updated.username,
  });
}

main().catch((error) => {
  logger.error("Admin bootstrap failed", { error });
  process.exit(1);
});

