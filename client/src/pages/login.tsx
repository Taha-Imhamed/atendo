import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Lock, User, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Background3D from "@/components/background-3d";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useQueryClient } from "@tanstack/react-query";
import AppLogo from "@/components/app-logo";

type PortalRole = "professor" | "student";

function parseRoleFromSearch(search: string): PortalRole {
  const params = new URLSearchParams(search ?? "");
  const role = params.get("role");
  return role === "student" ? "student" : "professor";
}

function parseForcedRoleFromPath(path: string): PortalRole | null {
  if (path.startsWith("/professor/login")) return "professor";
  if (path.startsWith("/staff-access")) return "professor";
  if (path.startsWith("/student/login")) return "student";
  return null;
}

export default function Login() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<PortalRole>("professor");
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const forcedRole = parseForcedRoleFromPath(location);
  const portalRoleForUser = (role: "professor" | "student" | "admin") =>
    role === "admin" ? "professor" : role;
  const navigateAfterLogin = (role: PortalRole) => {
    const destination = role === "professor" ? "/professor/dashboard" : "/student/scan";
    setLocation(destination);
    window.setTimeout(() => {
      if (window.location.hash.includes("/login")) {
        setLocation(destination);
      }
    }, 200);
  };

  useEffect(() => {
    if (location === "/login") {
      setLocation("/professor/login");
      return;
    }
    const forced = parseForcedRoleFromPath(location);
    if (forced) {
      setSelectedRole(forced);
      return;
    }
    if (typeof window !== "undefined") {
      setSelectedRole(parseRoleFromSearch(window.location.search));
    }
  }, [location, setLocation]);

  useEffect(() => {
    if (isUserLoading) {
      return;
    }
    if (!user) {
      return;
    }

    const portalRole = portalRoleForUser(user.role);
    if (portalRole !== selectedRole) {
      setPortalError(
        `This is the ${selectedRole} portal. You are signed in as ${user.role}.`,
      );
      return;
    }

    setPortalError(null);
    navigateAfterLogin(portalRole);
  }, [isUserLoading, selectedRole, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPortalError(null);

    try {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      const authed = (await res.json()) as {
        role: "professor" | "student" | "admin";
        display_name: string;
        id: string;
        email: string;
        username: string;
        must_change_password?: boolean;
      };
      const role = authed.role as "professor" | "student" | "admin";

      const portalRole = portalRoleForUser(role);
      if (portalRole !== selectedRole) {
        throw new Error(`This is the ${selectedRole} portal. Please use the correct portal.`);
      }

      // Avoid blocking navigation on a follow-up network refetch.
      queryClient.setQueryData(["me"], authed);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      toast({
        title: "Signed in",
        description: `Welcome back, ${authed.display_name}.`,
      });

      navigateAfterLogin(portalRole);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid username or password.";
      setPortalError(message);
      toast({
        variant: "destructive",
        title: "Login failed",
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <Background3D />
      <div className="w-full max-w-md">
        <Card className="relative glass-card border-border/70 shadow-2xl overflow-hidden">
          <CardHeader className="text-center pb-3 space-y-4">
            <div className="flex justify-start">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLocation("/")}
                className="text-muted-foreground hover:text-primary"
              >
                Back
              </Button>
            </div>
            <div className="mx-auto">
              <AppLogo compact className="justify-center" />
            </div>
            <CardTitle className="text-3xl font-black tracking-tight text-foreground">
              Sign In
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Use your real account from the database.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-center text-sm font-medium text-foreground">
              {forcedRole === "professor" ? "Professor Portal" : "Student Portal"}
            </div>
            {forcedRole === "professor" && (
              <div className="text-center text-xs text-muted-foreground">
                <Link href="/student/login" className="underline underline-offset-4 hover:text-primary">
                  Go to Student login
                </Link>
              </div>
            )}

            {portalError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {portalError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 h-11 rounded-lg"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11 rounded-lg"
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full h-11">
                {loading ? "Signing in..." : "Sign In"}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
