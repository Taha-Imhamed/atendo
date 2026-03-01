import { useQuery } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/queryClient";

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
  display_name: string;
  role: "professor" | "student";
  must_change_password?: boolean;
}

export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/auth/me"), { credentials: "include" });
      if (res.status === 401) {
        return null;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to fetch user");
      }

      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
