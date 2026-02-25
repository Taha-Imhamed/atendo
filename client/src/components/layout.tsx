import { Link, useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import Background3D from "./background-3d";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import ThemeSwitcher from "./theme-switcher";
import AppLogo from "./app-logo";

interface LayoutProps {
  children: React.ReactNode;
  role?: "professor" | "student" | "guest";
}

export default function Layout({ children, role = "guest" }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // Ignore logout failures and clear client state anyway.
    } finally {
      queryClient.setQueryData(["me"], null);
      queryClient.removeQueries();
    }
    setLocation("/");
  };

  return (
    <div className="min-h-screen flex flex-col font-sans text-foreground bg-background relative">
      <Background3D />
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/85 backdrop-blur-3xl shadow-[0_4px_30px_rgba(94,102,112,0.12)] pt-[env(safe-area-inset-top)]">
        <div className="container mx-auto px-3 sm:px-6 py-3 sm:py-0 sm:h-16 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <AppLogo />
          </Link>

          <nav className="flex items-center gap-3">
            <ThemeSwitcher />
            {role === "professor" && (
              <>
                <Link
                  href="/professor/dashboard"
                  className={`text-sm font-medium transition-colors ${
                    location === "/professor/dashboard" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/professor/roster"
                  className={`text-sm font-medium transition-colors ${
                    location === "/professor/roster" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Roster
                </Link>
                <div className="h-4 w-px bg-border mx-2" />
              </>
            )}

            {role !== "guest" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            )}
            {role === "guest" && (
              <>
                <Link href="/professor/login" className="text-sm font-medium text-muted-foreground hover:text-primary">
                  Professor Login
                </Link>
                <Link href="/student/login" className="text-sm font-medium text-muted-foreground hover:text-primary">
                  Student Login
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
          <div className="rounded-2xl sm:rounded-[32px] border border-border/70 bg-card/80 shadow-[0_24px_60px_rgba(94,102,112,0.12)] backdrop-blur-3xl">
            <div className="p-4 sm:p-6 md:p-8 lg:p-10">{children}</div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-background/80 py-6 mt-auto pb-[env(safe-area-inset-bottom)]">
        <div className="container mx-auto px-3 sm:px-4 text-center text-sm text-muted-foreground">
          (c) 2024 Attendo University System. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
