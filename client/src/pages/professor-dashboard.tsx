import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Users, Calendar, ArrowRight, BarChart3, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Layout from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";

type DashboardCourse = {
  id: string;
  code: string;
  name: string;
  term: string;
  description: string | null;
  totalStudents: number;
  groups: Array<{
    id: string;
    name: string;
    meeting_schedule: string | null;
    enrollmentCount: number;
    activeSessionId: string | null;
  }>;
};

export default function ProfessorDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: user } = useCurrentUser();
  const createFormRef = useRef<HTMLFormElement | null>(null);
  const coursesQuery = useQuery<{ courses: DashboardCourse[] }>({
    queryKey: ["professor", "courses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/professor/courses");
      return res.json();
    },
    enabled: user?.role === "professor",
  });
  const courses = coursesQuery.data?.courses ?? [];
  const [accountState, setAccountState] = useState({
    role: "student",
    email: "",
    username: "",
    display_name: "",
    password: "",
  });
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [startingSessionId, setStartingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (user === null) {
      setLocation("/professor/login");
      return;
    }
    if (user && user.role !== "professor") {
      setLocation("/professor/login");
    }
  }, [user, setLocation]);

  const handleStartSession = async (course: DashboardCourse) => {
    const defaultGroup = course.groups[0];
    if (!defaultGroup) {
      toast({
        variant: "destructive",
        title: "No group found",
        description: "Create a group for this course before starting a session.",
      });
      return;
    }

    setStartingSessionId(course.id);
    try {
      const res = await apiRequest(
        "POST",
        `/api/professor/groups/${defaultGroup.id}/sessions`,
      );
      const data = await res.json();
      toast({
        title: "Session started",
        description: `${course.code} - ${defaultGroup.name}`,
      });
      setLocation(`/professor/session/${data.session.id}`);
      coursesQuery.refetch();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not start session",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setStartingSessionId(null);
    }
  };

  const handleAccountSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !accountState.display_name.trim() ||
      !accountState.username.trim() ||
      !accountState.email.trim() ||
      !accountState.password
    ) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "All account fields are required.",
      });
      return;
    }
    if (accountState.password.length < 8) {
      toast({
        variant: "destructive",
        title: "Weak password",
        description: "Password must be at least 8 characters.",
      });
      return;
    }
    setCreatingAccount(true);

    try {
      await apiRequest("POST", "/api/professor/users", accountState);
      toast({
        title: "Account created",
        description: `${accountState.display_name} (${accountState.role}) is ready to login.`,
      });
      setAccountState({
        role: "student",
        email: "",
        username: "",
        display_name: "",
        password: "",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Account creation failed",
        description: error instanceof Error ? error.message : "Could not create the account.",
      });
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleScrollToCreate = () => {
    const el = createFormRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const codeInput = el.querySelector<HTMLInputElement>("#course-code");
      codeInput?.focus();
    }
  };

  const handleCreateCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("course-code") || "").trim();
    const name = String(formData.get("course-name") || "").trim();
    const term = String(formData.get("course-term") || "").trim();
    if (!code || !name) {
      toast({
        variant: "destructive",
        title: "Course details missing",
        description: "Please provide both code and name.",
      });
      return;
    }

    try {
      await apiRequest("POST", "/api/professor/courses", {
        code,
        name,
        term: term || "TBD",
      });
      await coursesQuery.refetch();

      toast({
        title: "Class created",
        description: `${code} - ${name} is ready.`,
      });
      event.currentTarget.reset();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not create class",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const totalStudents = courses.reduce(
    (sum, course) => sum + course.totalStudents,
    0,
  );
  const activeSessions = courses.reduce(
    (sum, course) =>
      sum +
      course.groups.filter((group) => Boolean(group.activeSessionId)).length,
    0,
  );

  return (
    <Layout role="professor">
      <div className="space-y-8 animate-in-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-primary mb-2">
              Welcome, {user?.display_name ?? "Professor"}
            </h1>
            <p className="text-muted-foreground">Manage your classes and active sessions.</p>
          </div>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
            onClick={handleScrollToCreate}
          >
            <Plus className="w-4 h-4 mr-2" /> New Class
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-primary via-accent to-secondary text-white border-none shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-medium opacity-90">
                <Users className="w-5 h-5" /> Total Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{totalStudents}</div>
              <p className="text-sm opacity-70 mt-1">Across {courses.length} courses</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-muted-foreground">
                <Calendar className="w-5 h-5" /> Active Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground">{activeSessions}</div>
              <p className="text-sm text-muted-foreground mt-1">Running right now</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-medium text-muted-foreground">
                <BarChart3 className="w-5 h-5" /> Courses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-primary">{courses.length}</div>
              <p className="text-sm text-muted-foreground mt-1">Keep growing enrollment</p>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-2xl font-heading font-semibold mb-6">Your Courses</h2>
          <div className="grid gap-6">
            {coursesQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading courses...</p>
            )}
            {!coursesQuery.isLoading && courses.length === 0 && (
              <p className="text-sm text-muted-foreground">No courses yet. Create one below.</p>
            )}
            {courses.map((course) => {
              const defaultGroup = course.groups[0];
              const activeSessionId =
                course.groups.find((group) => group.activeSessionId)?.activeSessionId ?? null;

              return (
                <div key={course.id} className="group">
                  <Card className="overflow-hidden border border-border/70 bg-card/90 backdrop-blur-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono text-xs bg-secondary border-secondary-foreground/10">
                            {course.code}
                          </Badge>
                          <h3 className="text-xl font-bold text-foreground">
                            {course.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" /> {defaultGroup?.meeting_schedule ?? course.term}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" /> {course.totalStudents} Students
                          </span>
                          {activeSessionId && (
                            <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-semibold">
                              Live session
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {activeSessionId ? (
                          <Link href={`/professor/stats/${activeSessionId}`}>
                            <Button variant="outline">
                              View Stats
                            </Button>
                          </Link>
                        ) : (
                          <Button variant="outline" disabled>
                            View Stats
                          </Button>
                        )}
                        <Button 
                          onClick={() => handleStartSession(course)}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/30"
                          disabled={startingSessionId === course.id}
                        >
                          {startingSessionId === course.id ? "Starting..." : "Start Session"} <ArrowRight className="ml-2 w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-heading font-semibold mb-6">Create user accounts</h2>
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Create students & professor logins</CardTitle>
              <p className="text-sm text-muted-foreground">
                Securely provision new Anas-style accounts right from your dashboard.
              </p>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleAccountSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="account-role">Role</Label>
                    <select
                      id="account-role"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                      value={accountState.role}
                      onChange={(event) =>
                        setAccountState((prev) => ({
                          ...prev,
                          role: event.target.value,
                        }))
                      }
                    >
                      <option value="student">Student</option>
                      <option value="professor">Professor</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="account-display-name">Display name</Label>
                    <Input
                      id="account-display-name"
                      placeholder="Full name"
                      value={accountState.display_name}
                      onChange={(event) =>
                        setAccountState((prev) => ({
                          ...prev,
                          display_name: event.target.value,
                        }))
                      }
                      autoComplete="name"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="account-username">Username</Label>
                  <Input
                    id="account-username"
                    placeholder="username"
                    value={accountState.username}
                    onChange={(event) =>
                        setAccountState((prev) => ({
                          ...prev,
                          username: event.target.value,
                        }))
                      }
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="account-email">Email</Label>
                  <Input
                    id="account-email"
                    placeholder="email@university.edu"
                    value={accountState.email}
                    onChange={(event) =>
                        setAccountState((prev) => ({
                          ...prev,
                          email: event.target.value,
                        }))
                      }
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="account-password">Password</Label>
                  <Input
                    id="account-password"
                    placeholder="password"
                    type="password"
                    value={accountState.password}
                    onChange={(event) =>
                      setAccountState((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={creatingAccount}
                >
                  {creatingAccount ? "Creating account..." : "Create account"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-2xl font-heading font-semibold mb-6">Create a new class</h2>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="pt-6">
              <form className="space-y-4" onSubmit={handleCreateCourse} ref={createFormRef}>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="course-code">Course code</Label>
                    <Input id="course-code" name="course-code" placeholder="CS-101" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="course-name">Course name</Label>
                    <Input id="course-name" name="course-name" placeholder="Foundations of Computing" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="course-term">Term / schedule</Label>
                  <Input id="course-term" name="course-term" placeholder="Fall 2024" />
                </div>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Create class
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

