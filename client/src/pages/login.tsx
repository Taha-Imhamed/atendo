import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { GraduationCap, Lock, User, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Background3D from "@/components/background-3d";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useQueryClient } from "@tanstack/react-query";

type PortalRole = "professor" | "student";

function parseRoleFromSearch(search: string): PortalRole {
  const params = new URLSearchParams(search ?? "");
  const role = params.get("role");
  return role === "student" ? "student" : "professor";
}

function parseForcedRoleFromPath(path: string): PortalRole | null {
  if (path.startsWith("/professor/login")) return "professor";
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
  const [selectedRole, setSelectedRole] = useState<PortalRole>(() =>
    typeof window === "undefined"
      ? "professor"
      : parseRoleFromSearch(window.location.search),
  );
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const forcedRole = parseForcedRoleFromPath(location);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/login") {
      setLocation("/professor/login");
      return;
    }
    const forced = parseForcedRoleFromPath(window.location.pathname);
    if (forced) {
      setSelectedRole(forced);
      return;
    }
    setSelectedRole(parseRoleFromSearch(window.location.search));
  }, [location, setLocation]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (user.role !== selectedRole) {
      setPortalError(
        `This is the ${selectedRole} portal. You are signed in as ${user.role}.`,
      );
      return;
    }

    setPortalError(null);
    setLocation(user.role === "professor" ? "/professor/dashboard" : "/student/scan");
  }, [selectedRole, setLocation, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPortalError(null);

    try {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      const authed = await res.json();
      const role = authed.role as "professor" | "student" | "admin";

      if (role === "admin") {
        throw new Error("Admin users do not have a web portal route configured.");
      }

      if (role !== selectedRole) {
        throw new Error(`This is the ${selectedRole} portal. Please use the correct portal.`);
      }

      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast({
        title: "Signed in",
        description: `Welcome back, ${authed.display_name}.`,
      });

      setLocation(role === "professor" ? "/professor/dashboard" : "/student/scan");
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
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md"
      >
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
            <div className="w-14 h-14 bg-gradient-to-tr from-primary to-accent rounded-2xl flex items-center justify-center text-white mx-auto shadow-xl">
              <GraduationCap className="h-8 w-8" />
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
            <div className="text-center text-xs text-muted-foreground">
              {forcedRole === "professor" ? (
                <Link href="/student/login" className="underline underline-offset-4 hover:text-primary">
                  Go to Student login
                </Link>
              ) : (
                <Link href="/professor/login" className="underline underline-offset-4 hover:text-primary">
                  Go to Professor login
                </Link>
              )}
            </div>

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
      </motion.div>
    </div>
  );
}
