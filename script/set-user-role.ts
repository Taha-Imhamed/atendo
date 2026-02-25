import "dotenv/config";
import { eq } from "drizzle-orm";
import type { UserRole } from "@shared/schema";
import { users } from "@shared/schema";
import { db } from "../server/db/index";
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
    "  npx tsx script/set-user-role.ts --role <student|professor|admin> (--username <u> | --email <e> | --id <uuid>)",
    "",
    "Examples:",
    "  npx tsx script/set-user-role.ts --role professor --username anas",
    "  npx tsx script/set-user-role.ts --role admin --email admin@uni.edu",
  ].join("\n");
}

function parseRole(value: string | undefined): UserRole | undefined {
  if (!value) return undefined;
  if (value === "student" || value === "professor" || value === "admin") return value;
  return undefined;
}

async function main() {
  const role = parseRole(readArg("role") ?? process.env.SET_ROLE);
  const userId = readArg("id");
  const username = readArg("username");
  const email = readArg("email");

  if (!role || (!userId && !username && !email)) {
    console.error(usage());
    process.exit(1);
  }

  const user = userId
    ? await userRepository.findById(userId)
    : username
      ? await userRepository.findByUsername(username)
      : await userRepository.findByEmail(email!);

  if (!user) {
    console.error("User not found.");
    process.exit(1);
  }

  if (user.role === role) {
    logger.info("No changes needed (role already set)", {
      userId: user.id,
      username: user.username,
      role,
    });
    return;
  }

  const [updated] = await db
    .update(users)
    .set({ role })
    .where(eq(users.id, user.id))
    .returning();

  logger.info("User role updated", {
    userId: updated.id,
    username: updated.username,
    role: updated.role,
  });
}

main().catch((error) => {
  logger.error("set-user-role failed", { error });
  process.exit(1);
});

