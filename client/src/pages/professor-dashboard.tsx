import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Users, Calendar, ArrowRight, BarChart3, Clock, Download, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Layout from "@/components/layout";
import { apiRequest, buildApiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";

type DashboardCourse = {
  id: string;
  code: string;
  name: string;
  term: string;
  description: string | null;
  latestSessionId: string | null;
  totalStudents: number;
  groups: Array<{
    id: string;
    name: string;
    meeting_schedule: string | null;
    enrollmentCount: number;
    activeSessionId: string | null;
  }>;
};

type AttendanceLogDate = {
  date: string;
  sessionCount: number;
};

type AttendanceLogResponse = {
  date: string;
  sessions: Array<{
    sessionId: string;
    startsAt: string;
    endsAt: string | null;
    isActive: boolean;
    courseCode: string;
    courseName: string;
    groupName: string;
  }>;
  records: Array<{
    recordId: string;
    sessionId: string;
    recordedAt: string;
    status: string;
    roundNumber: number;
    studentName: string;
    studentUsername: string;
    courseCode: string;
    courseName: string;
    groupName: string;
  }>;
};

type CourseSummaryResponse = {
  course: { id: string; code: string; name: string; term: string };
  totalSessions: number;
  students: Array<{
    studentId: string;
    displayName: string;
    username: string;
    email: string;
    attendedClasses: number;
    missedClasses: number;
    totalClasses: number;
    attendancePercent: number;
    status: "pass" | "fail";
  }>;
};

type ManagedUser = {
  id: string;
  role: "professor" | "student" | "admin";
  username: string;
  email: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
  assignments: Array<{
    courseId: string;
    courseCode: string;
    courseName: string;
    groupId: string;
    groupName: string;
  }>;
};

export default function ProfessorDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const isProfessor = user?.role === "professor" || user?.role === "admin";
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
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedRosterCourseId, setSelectedRosterCourseId] = useState("");
  const [selectedRosterGroupId, setSelectedRosterGroupId] = useState("");
  const [selectedRosterStudentIds, setSelectedRosterStudentIds] = useState<
    string[]
  >([]);
  const [assigningRosterStudents, setAssigningRosterStudents] = useState(false);
  const [selectedLogDate, setSelectedLogDate] = useState("");
  const [selectedLogCourse, setSelectedLogCourse] = useState("all");
  const [accountState, setAccountState] = useState({
    role: "student",
    email: "",
    username: "",
    display_name: "",
    password: "00000000",
  });
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [startingSessionId, setStartingSessionId] = useState<string | null>(null);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [exportingLog, setExportingLog] = useState(false);
  const [creatingGroupId, setCreatingGroupId] = useState<string | null>(null);
  const [groupDrafts, setGroupDrafts] = useState<
    Record<string, { name: string; meeting_schedule: string }>
  >({});
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignCourseId, setAssignCourseId] = useState<string>("");
  const [assignGroupId, setAssignGroupId] = useState<string>("");
  const [assignSelectedStudentIds, setAssignSelectedStudentIds] = useState<
    string[]
  >([]);
  const [assigningStudents, setAssigningStudents] = useState(false);

  const generateRandomPassword = (length = 12) => {
    const alphabet =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  };

  const attendanceLogDatesQuery = useQuery<{ dates: AttendanceLogDate[] }>({
    queryKey: ["professor", "attendance-log", "dates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/professor/attendance-log/dates");
      return res.json();
    },
    enabled: isProfessor,
  });

  const attendanceLogQuery = useQuery<AttendanceLogResponse>({
    queryKey: ["professor", "attendance-log", selectedLogDate],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/professor/attendance-log?date=${encodeURIComponent(selectedLogDate)}`,
      );
      return res.json();
    },
    enabled: isProfessor && Boolean(selectedLogDate),
  });

  const courseSummaryQuery = useQuery<CourseSummaryResponse>({
    queryKey: ["professor", "course-summary", selectedCourseId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/professor/reports/course-summary?courseId=${encodeURIComponent(selectedCourseId)}`,
      );
      return res.json();
    },
    enabled: isProfessor && Boolean(selectedCourseId),
  });

  const managedUsersQuery = useQuery<{ users: ManagedUser[] }>({
    queryKey: ["professor", "users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/professor/users");
      return res.json();
    },
    enabled: isProfessor,
  });

  useEffect(() => {
    if (isUserLoading) {
      return;
    }
    if (user === null) {
      setLocation("/professor/login");
      return;
    }
    if (user && user.role !== "professor" && user.role !== "admin") {
      setLocation("/professor/login");
    }
  }, [isUserLoading, user, setLocation]);

  useEffect(() => {
    if (selectedLogDate) {
      return;
    }
    const firstDate = attendanceLogDatesQuery.data?.dates[0]?.date;
    if (firstDate) {
      setSelectedLogDate(firstDate);
    }
  }, [attendanceLogDatesQuery.data, selectedLogDate]);

  useEffect(() => {
    if (selectedCourseId) {
      return;
    }
    const firstCourse = courses[0];
    if (firstCourse) {
      setSelectedCourseId(firstCourse.id);
    }
  }, [courses, selectedCourseId]);

  const assignCourse = useMemo(
    () => courses.find((course) => course.id === assignCourseId),
    [courses, assignCourseId],
  );

  useEffect(() => {
    if (!assignCourse) {
      setAssignGroupId("");
      return;
    }
    if (!assignCourse.groups.length) {
      setAssignGroupId("");
      return;
    }
    if (!assignCourse.groups.some((group) => group.id === assignGroupId)) {
      setAssignGroupId(assignCourse.groups[0].id);
    }
  }, [assignCourse, assignGroupId]);

  useEffect(() => {
    if (selectedRosterCourseId) {
      return;
    }
    const firstCourse = courses[0];
    if (firstCourse) {
      setSelectedRosterCourseId(firstCourse.id);
    }
  }, [courses, selectedRosterCourseId]);

  const rosterGroupOptions = useMemo(() => {
    const course = courses.find((item) => item.id === selectedRosterCourseId);
    return course?.groups ?? [];
  }, [courses, selectedRosterCourseId]);

  useEffect(() => {
    if (!rosterGroupOptions.length) {
      setSelectedRosterGroupId("");
      return;
    }
    if (!rosterGroupOptions.some((group) => group.id === selectedRosterGroupId)) {
      setSelectedRosterGroupId(rosterGroupOptions[0].id);
    }
  }, [rosterGroupOptions, selectedRosterGroupId]);

  const rosterStudents = useMemo(
    () =>
      (managedUsersQuery.data?.users ?? []).filter(
        (user) => user.role === "student",
      ),
    [managedUsersQuery.data?.users],
  );

  const toggleRosterStudent = (studentId: string) => {
    setSelectedRosterStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId],
    );
  };

  const handleAssignRosterStudents = async () => {
    if (!selectedRosterGroupId) {
      toast({
        variant: "destructive",
        title: "Pick a group",
        description: "Select a class group before assigning students.",
      });
      return;
    }
    if (!selectedRosterStudentIds.length) {
      toast({
        variant: "destructive",
        title: "No students selected",
        description: "Select at least one student to assign.",
      });
      return;
    }

    setAssigningRosterStudents(true);
    const results = await Promise.allSettled(
      selectedRosterStudentIds.map((studentId) =>
        apiRequest(
          "POST",
          `/api/professor/groups/${selectedRosterGroupId}/enrollments`,
          { studentId },
        ),
      ),
    );
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failCount = results.length - successCount;

    if (successCount > 0) {
      toast({
        title: "Students assigned",
        description: `${successCount} student(s) added to the group.`,
      });
    }
    if (failCount > 0) {
      toast({
        variant: "destructive",
        title: "Some assignments failed",
        description: `${failCount} student(s) could not be assigned.`,
      });
    }

    setAssigningRosterStudents(false);
    setSelectedRosterStudentIds([]);
    await Promise.all([coursesQuery.refetch(), managedUsersQuery.refetch()]);
  };

  useEffect(() => {
    setSelectedLogCourse("all");
  }, [selectedLogDate]);

  const logCourseOptions = useMemo(() => {
    const sessions = attendanceLogQuery.data?.sessions ?? [];
    return Array.from(
      new Map(
        sessions.map((session) => [
          session.courseCode,
          { code: session.courseCode, name: session.courseName },
        ]),
      ).values(),
    );
  }, [attendanceLogQuery.data?.sessions]);

  const filteredLogSessions = useMemo(() => {
    const sessions = attendanceLogQuery.data?.sessions ?? [];
    if (selectedLogCourse === "all") {
      return sessions;
    }
    return sessions.filter((session) => session.courseCode === selectedLogCourse);
  }, [attendanceLogQuery.data?.sessions, selectedLogCourse]);

  const filteredLogRecords = useMemo(() => {
    const records = attendanceLogQuery.data?.records ?? [];
    if (selectedLogCourse === "all") {
      return records;
    }
    return records.filter((record) => record.courseCode === selectedLogCourse);
  }, [attendanceLogQuery.data?.records, selectedLogCourse]);

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
      await attendanceLogDatesQuery.refetch();
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
    const isStudent = accountState.role === "student";
    if (!accountState.display_name.trim() || !accountState.username.trim()) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Display name and username are required.",
      });
      return;
    }
    if (!isStudent && (!accountState.email.trim() || !accountState.password.trim())) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Professor accounts require email and password.",
      });
      return;
    }
    if (accountState.password.trim() && accountState.password.length < 8) {
      toast({
        variant: "destructive",
        title: "Weak password",
        description: "Password must be at least 8 characters.",
      });
      return;
    }
    setCreatingAccount(true);

    try {
      await apiRequest("POST", "/api/professor/users", {
        role: accountState.role,
        username: accountState.username.trim(),
        display_name: accountState.display_name.trim(),
        email: accountState.email.trim() || undefined,
        password: accountState.password.trim() || undefined,
      });
      toast({
        title: "Account created",
        description: `${accountState.display_name} (${accountState.role}) is ready to login.`,
      });
      setAccountState({
        role: "student",
        email: "",
        username: "",
        display_name: "",
        password: "00000000",
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
    const form = event.currentTarget;
    const formData = new FormData(form);
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

    setCreatingCourse(true);
    try {
      await apiRequest("POST", "/api/professor/courses", {
        code,
        name,
        term: term || "TBD",
      });

      toast({
        title: "Class created",
        description: `${code} - ${name} is ready.`,
      });
      form.reset();
      try {
        await coursesQuery.refetch();
      } catch {
        // Trigger a real background refresh retry.
        window.setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: ["professor", "courses"] });
        }, 1000);
        toast({
          title: "Class created",
          description: "Saved successfully. Refreshing list failed once, retrying in background.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not create class",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setCreatingCourse(false);
    }
  };

  const updateGroupDraft = (
    courseId: string,
    patch: Partial<{ name: string; meeting_schedule: string }>,
  ) => {
    setGroupDrafts((prev) => {
      const current = prev[courseId] ?? { name: "", meeting_schedule: "" };
      return { ...prev, [courseId]: { ...current, ...patch } };
    });
  };

  const handleCreateGroup = async (
    event: FormEvent<HTMLFormElement>,
    course: DashboardCourse,
  ) => {
    event.preventDefault();
    const draft = groupDrafts[course.id] ?? { name: "", meeting_schedule: "" };
    const name = draft.name.trim();
    if (!name) {
      toast({
        variant: "destructive",
        title: "Missing group name",
        description: "Give the group a name like Java 01 A.",
      });
      return;
    }

    setCreatingGroupId(course.id);
    try {
      await apiRequest("POST", `/api/professor/courses/${course.id}/groups`, {
        name,
        meeting_schedule: draft.meeting_schedule.trim() || undefined,
      });
      toast({
        title: "Group created",
        description: `${course.code} now has ${name}.`,
      });
      updateGroupDraft(course.id, { name: "", meeting_schedule: "" });
      await coursesQuery.refetch();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not create group",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setCreatingGroupId(null);
    }
  };

  const handleDeleteCourse = async (course: DashboardCourse) => {
    setDeletingCourseId(course.id);
    try {
      await apiRequest("DELETE", `/api/professor/courses/${course.id}`);
      await Promise.all([
        coursesQuery.refetch(),
        attendanceLogDatesQuery.refetch(),
      ]);
      toast({
        title: "Course deleted",
        description: `${course.code} - ${course.name} was removed.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not delete course",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setDeletingCourseId(null);
    }
  };

  const handleExportLog = async () => {
    if (!selectedLogDate) {
      return;
    }

    setExportingLog(true);
    try {
      const res = await fetch(
        buildApiUrl(`/api/professor/attendance-log/export?date=${encodeURIComponent(selectedLogDate)}`),
        { credentials: "include" },
      );
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Could not export attendance log.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendance-log-${selectedLogDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Export started",
        description: `Attendance log for ${selectedLogDate} is downloading.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setExportingLog(false);
    }
  };

  const openAssignDialog = (course: DashboardCourse) => {
    if (!course.groups.length) {
      toast({
        variant: "destructive",
        title: "No group found",
        description: "Create a group first, then assign students.",
      });
      return;
    }
    setAssignCourseId(course.id);
    setAssignGroupId(course.groups[0].id);
    setAssignSelectedStudentIds([]);
    setAssignDialogOpen(true);
  };

  const toggleStudentSelection = (studentId: string) => {
    setAssignSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId],
    );
  };

  const handleAssignStudents = async () => {
    if (!assignGroupId) {
      toast({
        variant: "destructive",
        title: "Pick a group",
        description: "Select a group before assigning students.",
      });
      return;
    }
    if (!assignSelectedStudentIds.length) {
      toast({
        variant: "destructive",
        title: "No students selected",
        description: "Select at least one student to assign.",
      });
      return;
    }

    setAssigningStudents(true);
    const results = await Promise.allSettled(
      assignSelectedStudentIds.map((studentId) =>
        apiRequest(
          "POST",
          `/api/professor/groups/${assignGroupId}/enrollments`,
          { studentId },
        ),
      ),
    );
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failCount = results.length - successCount;

    if (successCount > 0) {
      toast({
        title: "Students assigned",
        description: `${successCount} student(s) added to the group.`,
      });
    }
    if (failCount > 0) {
      toast({
        variant: "destructive",
        title: "Some assignments failed",
        description: `${failCount} student(s) could not be assigned.`,
      });
    }

    setAssigningStudents(false);
    setAssignSelectedStudentIds([]);
    setAssignDialogOpen(false);
    await coursesQuery.refetch();
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
      <AlertDialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Assign students to a group</AlertDialogTitle>
            <AlertDialogDescription>
              Pick a class group, select students, then assign them in one click.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="assign-course">Course</Label>
                <Select
                  value={assignCourseId}
                  onValueChange={(value) => {
                    setAssignCourseId(value);
                    setAssignSelectedStudentIds([]);
                  }}
                >
                  <SelectTrigger id="assign-course" className="h-11">
                    <SelectValue placeholder="Select a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.code} - {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign-group">Group</Label>
                <Select
                  value={assignGroupId}
                  onValueChange={setAssignGroupId}
                  disabled={!assignCourse?.groups?.length}
                >
                  <SelectTrigger id="assign-group" className="h-11">
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {(assignCourse?.groups ?? []).map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border/70">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-2">
                <p className="text-sm font-medium">Students</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setAssignSelectedStudentIds(
                        (managedUsersQuery.data?.users ?? [])
                          .filter((user) => user.role === "student")
                          .map((user) => user.id),
                      )
                    }
                  >
                    Select all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAssignSelectedStudentIds([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="max-h-72 overflow-auto">
                {managedUsersQuery.isLoading ? (
                  <p className="p-4 text-sm text-muted-foreground">Loading students...</p>
                ) : (managedUsersQuery.data?.users ?? []).filter(
                    (user) => user.role === "student",
                  ).length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(managedUsersQuery.data?.users ?? [])
                        .filter((user) => user.role === "student")
                        .map((student) => (
                          <TableRow key={student.id}>
                            <TableCell>
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={assignSelectedStudentIds.includes(student.id)}
                                onChange={() => toggleStudentSelection(student.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {student.display_name}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {student.username}
                            </TableCell>
                            <TableCell>{student.email}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    No students found yet. Create students first, then assign them.
                  </p>
                )}
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assigningStudents}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleAssignStudents()}
              disabled={assigningStudents}
            >
              {assigningStudents ? "Assigning..." : "Assign students"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              const statusSessionId = activeSessionId ?? course.latestSessionId;

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
                        <Button
                          variant="outline"
                          onClick={() => openAssignDialog(course)}
                        >
                          Assign Students
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              disabled={deletingCourseId === course.id}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {deletingCourseId === course.id ? "Deleting..." : "Delete"}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this course?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove {course.code} - {course.name}, including its groups,
                                sessions, rounds, attendance records, and related course policies.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => void handleDeleteCourse(course)}
                              >
                                Delete course
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        {statusSessionId ? (
                          <Link href={`/professor/stats/${statusSessionId}`}>
                            <Button variant="outline">
                              View Status
                            </Button>
                          </Link>
                        ) : (
                          <Button variant="outline" disabled>
                            View Status
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
                    <div className="border-t border-border/60 bg-background/70 px-6 py-4">
                      <div className="flex flex-col gap-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-foreground">Groups</p>
                          {course.groups.length ? (
                            <div className="flex flex-wrap gap-2">
                              {course.groups.map((group) => (
                                <Link
                                  key={group.id}
                                  href={`/professor/roster?courseId=${encodeURIComponent(course.id)}&groupId=${encodeURIComponent(group.id)}`}
                                >
                                  <Button size="sm" variant="outline">
                                    {group.name}
                                  </Button>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No groups yet. Create one below.
                            </p>
                          )}
                        </div>

                        <form
                          className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] items-end"
                          onSubmit={(event) => handleCreateGroup(event, course)}
                        >
                          <div className="space-y-1">
                            <Label htmlFor={`group-name-${course.id}`}>New group name</Label>
                            <Input
                              id={`group-name-${course.id}`}
                              placeholder="Java 01 A"
                              value={groupDrafts[course.id]?.name ?? ""}
                              onChange={(event) =>
                                updateGroupDraft(course.id, { name: event.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`group-schedule-${course.id}`}>Schedule (optional)</Label>
                            <Input
                              id={`group-schedule-${course.id}`}
                              placeholder="Mon 9:00-11:00"
                              value={groupDrafts[course.id]?.meeting_schedule ?? ""}
                              onChange={(event) =>
                                updateGroupDraft(course.id, { meeting_schedule: event.target.value })
                              }
                            />
                          </div>
                          <Button
                            type="submit"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                            disabled={creatingGroupId === course.id}
                          >
                            {creatingGroupId === course.id ? "Creating..." : "Add Group"}
                          </Button>
                        </form>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-heading font-semibold mb-6">
            Add students to a group
          </h2>
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Choose class + group</CardTitle>
              <p className="text-sm text-muted-foreground">
                Select a group, then pick the students you want to assign.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="roster-course-select">Course</Label>
                  <Select
                    value={selectedRosterCourseId}
                    onValueChange={setSelectedRosterCourseId}
                    disabled={coursesQuery.isLoading || courses.length === 0}
                  >
                    <SelectTrigger id="roster-course-select" className="h-11">
                      <SelectValue placeholder="Select a course" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.code} - {course.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roster-group-select">Group</Label>
                  <Select
                    value={selectedRosterGroupId}
                    onValueChange={setSelectedRosterGroupId}
                    disabled={!rosterGroupOptions.length}
                  >
                    <SelectTrigger id="roster-group-select" className="h-11">
                      <SelectValue placeholder="Select a group" />
                    </SelectTrigger>
                    <SelectContent>
                      {rosterGroupOptions.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border border-border/70">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-2">
                  <p className="text-sm font-medium">Students</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSelectedRosterStudentIds(rosterStudents.map((s) => s.id))
                      }
                      disabled={!rosterStudents.length}
                    >
                      Select all
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedRosterStudentIds([])}
                      disabled={!rosterStudents.length}
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      disabled={
                        assigningRosterStudents ||
                        !selectedRosterGroupId ||
                        !selectedRosterStudentIds.length
                      }
                      onClick={() => void handleAssignRosterStudents()}
                    >
                      {assigningRosterStudents ? "Assigning..." : "Assign students"}
                    </Button>
                  </div>
                </div>
                <div className="max-h-72 overflow-auto">
                  {managedUsersQuery.isLoading ? (
                    <p className="p-4 text-sm text-muted-foreground">Loading students...</p>
                  ) : rosterStudents.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Username</TableHead>
                          <TableHead>Email</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rosterStudents.map((student) => {
                          const alreadyAssigned = student.assignments.some(
                            (assignment) => assignment.groupId === selectedRosterGroupId,
                          );
                          return (
                            <TableRow key={student.id}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={selectedRosterStudentIds.includes(student.id)}
                                  onChange={() => toggleRosterStudent(student.id)}
                                  disabled={alreadyAssigned}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                {student.display_name}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {student.username}
                              </TableCell>
                              <TableCell>{student.email}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">
                      No students found yet. Create students first, then assign them.
                    </p>
                  )}
                </div>
              </div>

              {!courses.length && (
                <p className="text-sm text-muted-foreground">
                  Create a course and group first, then you can add students.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-2xl font-heading font-semibold mb-6">Attendance Log</h2>
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Attendance by date</CardTitle>
              <p className="text-sm text-muted-foreground">
                Pick one of the days you opened a session to see the attendance records from that date.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,240px)_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="attendance-log-date">Session date</Label>
                  <Select
                    value={selectedLogDate}
                    onValueChange={setSelectedLogDate}
                    disabled={attendanceLogDatesQuery.isLoading || !attendanceLogDatesQuery.data?.dates.length}
                  >
                    <SelectTrigger id="attendance-log-date" className="h-11">
                      <SelectValue placeholder="Select a date" />
                    </SelectTrigger>
                    <SelectContent>
                      {attendanceLogDatesQuery.data?.dates.map((item) => (
                        <SelectItem key={item.date} value={item.date}>
                          {new Date(`${item.date}T00:00:00`).toLocaleDateString()} ({item.sessionCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attendance-log-course">Course filter</Label>
                  <Select
                    value={selectedLogCourse}
                    onValueChange={setSelectedLogCourse}
                    disabled={!logCourseOptions.length}
                  >
                    <SelectTrigger id="attendance-log-course" className="h-11">
                      <SelectValue placeholder="All courses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All courses</SelectItem>
                      {logCourseOptions.map((course) => (
                        <SelectItem key={course.code} value={course.code}>
                          {course.code} - {course.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={!selectedLogDate || exportingLog}
                  onClick={handleExportLog}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {exportingLog ? "Exporting..." : "Export date CSV"}
                </Button>
              </div>

              {attendanceLogDatesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading session dates...</p>
              ) : !attendanceLogDatesQuery.data?.dates.length ? (
                <p className="text-sm text-muted-foreground">
                  No past session dates yet. Start a class and it will appear here.
                </p>
              ) : attendanceLogQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading attendance log...</p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Selected date</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {selectedLogDate
                          ? new Date(`${selectedLogDate}T00:00:00`).toLocaleDateString()
                          : "No date selected"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Sessions opened</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {filteredLogSessions.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Attendance records</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {filteredLogRecords.length}
                      </p>
                    </div>
                  </div>

                  {filteredLogSessions.length ? (
                    <div className="flex flex-wrap gap-2">
                      {filteredLogSessions.map((session) => (
                        <Link key={session.sessionId} href={`/professor/stats/${session.sessionId}`}>
                          <Badge variant="outline" className="px-3 py-1 cursor-pointer">
                            {session.courseCode} - {session.groupName}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {filteredLogRecords.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Course</TableHead>
                          <TableHead>Group</TableHead>
                          <TableHead>Round</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Recorded</TableHead>
                          <TableHead className="text-right">Stats</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLogRecords.map((record) => (
                          <TableRow key={record.recordId}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{record.studentName}</p>
                                <p className="text-xs text-muted-foreground">{record.studentUsername}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{record.courseCode}</p>
                                <p className="text-xs text-muted-foreground">{record.courseName}</p>
                              </div>
                            </TableCell>
                            <TableCell>{record.groupName}</TableCell>
                            <TableCell>Round {record.roundNumber}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {record.status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>{new Date(record.recordedAt).toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <Link href={`/professor/stats/${record.sessionId}`}>
                                <Button variant="outline" size="sm">
                                  View Stats
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No attendance records match this date and course filter.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-2xl font-heading font-semibold mb-6">Total class report</h2>
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Attendance history by course</CardTitle>
              <p className="text-sm text-muted-foreground">
                Students below 75% attendance are marked as fail.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="course-summary-select">Course</Label>
                  <Select
                    value={selectedCourseId}
                    onValueChange={setSelectedCourseId}
                    disabled={coursesQuery.isLoading || courses.length === 0}
                  >
                    <SelectTrigger id="course-summary-select" className="h-11">
                      <SelectValue placeholder="Select a course" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.code} - {course.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total sessions
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {courseSummaryQuery.data?.totalSessions ?? 0}
                  </p>
                </div>
              </div>

              {courseSummaryQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading report...</p>
              ) : courseSummaryQuery.data?.students?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Attended</TableHead>
                      <TableHead>Missed</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Percent</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courseSummaryQuery.data.students.map((student) => (
                      <TableRow key={student.studentId}>
                        <TableCell className="font-medium">{student.displayName}</TableCell>
                        <TableCell className="font-mono text-xs">{student.username}</TableCell>
                        <TableCell>{student.email}</TableCell>
                        <TableCell>{student.attendedClasses}</TableCell>
                        <TableCell>{student.missedClasses}</TableCell>
                        <TableCell>{student.totalClasses}</TableCell>
                        <TableCell>{student.attendancePercent}%</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              student.status === "fail"
                                ? "border-destructive text-destructive"
                                : "border-primary/50 text-primary"
                            }
                          >
                            {student.status === "fail" ? "Fail" : "Pass"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No students or sessions available for this course yet.
                </p>
              )}
            </CardContent>
          </Card>
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
                  <div className="flex gap-2">
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setAccountState((prev) => ({
                          ...prev,
                          password: generateRandomPassword(),
                        }))
                      }
                    >
                      <Wand2 className="w-4 h-4 mr-1" />
                      Random
                    </Button>
                  </div>
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
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={creatingCourse}>
                  {creatingCourse ? "Creating class..." : "Create class"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
