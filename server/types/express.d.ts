import type { UserRole } from "@shared/schema";

declare global {
  namespace Express {
    interface User {
      id: string;
      role: UserRole;
      email: string;
      username: string;
      display_name: string;
      must_change_password: boolean;
    }
  }
}

export {};
