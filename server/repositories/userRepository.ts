import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";

export const userRepository = {
  async findByUsername(username: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return user;
  },

  async findByEmail(email: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user;
  },

  async findById(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  },

  async createUser(payload: {
    email: string;
    username: string;
    display_name: string;
    password: string;
    created_by_professor_id?: string | null;
    must_change_password?: boolean;
    role?: "professor" | "student" | "admin";
  }) {
    const [user] = await db.insert(users).values(payload).returning();
    return user;
  },

  async updatePassword(userId: string, nextHashedPassword: string) {
    const [user] = await db
      .update(users)
      .set({ password: nextHashedPassword, must_change_password: false })
      .where(eq(users.id, userId))
      .returning();
    return user;
  },

  async updatePasswordWithForceFlag(
    userId: string,
    nextHashedPassword: string,
    mustChangePassword: boolean,
  ) {
    const [user] = await db
      .update(users)
      .set({
        password: nextHashedPassword,
        must_change_password: mustChangePassword,
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  },

  async syncBootstrapUser(
    userId: string,
    payload: {
      email: string;
      username: string;
      display_name: string;
      password: string;
      role: "professor" | "student";
    },
  ) {
    const [user] = await db
      .update(users)
      .set({
        email: payload.email,
        username: payload.username,
        display_name: payload.display_name,
        password: payload.password,
        role: payload.role,
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  },
};
