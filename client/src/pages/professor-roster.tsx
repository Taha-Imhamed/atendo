import { Users, UserPlus, Trash2, SlidersHorizontal, Upload, Download, Mail } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, buildApiUrl } from "@/lib/queryClient";

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

type GroupEnrollmentsResponse = {
  course: { id: string; code: string; name: string; term: string };
  group: { id: string; name: string; meeting_schedule: string | null };
  enrollments: Array<{
    id: string;
    enrolledAt: string;
    student: {
      id: string;
      username: string;
      display_name: string;
    };
  }>;
};

type RosterFile = {
  fileName: string;
  originalName: string;
  uploadedAt: string;
  size: number;
};

type RosterImportResult = {
  created: Array<{
    id: string;
    email: string;
    username: string;
    display_name: string;
    temporaryPassword: string;
    enrolled: boolean;
    wasExisting: boolean;
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

type AdminProfessor = {
  id: string;
  username: string;
  email: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
  courseCount: number;
  studentCount: number;
};

type RosterSettings = {
  showGroupPicker: boolean;
  showCreateEnroll: boolean;
  showUploadPanel: boolean;
  showEnrolledStudents: boolean;
};

const DEFAULT_SETTINGS: RosterSettings = {
  showGroupPicker: true,
  showCreateEnroll: true,
  showUploadPanel: true,
  showEnrolledStudents: true,
};

export default function ProfessorRoster() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const isProfessor = user?.role === "professor" || user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const hasAppliedPrefillRef = useRef(false);

  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [createStudentState, setCreateStudentState] = useState({
    display_name: "",
    username: "",
    password: "00000000",
  });
  const [bulkRosterText, setBulkRosterText] = useState("");
  const [bulkResults, setBulkResults] = useState<
    Array<{
      row: string;
      status: "created" | "failed";
      message: string;
    }>
  >([]);
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [lastImport, setLastImport] = useState<RosterImportResult | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editState, setEditState] = useState({
    username: "",
    email: "",
    display_name: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingSheet, setIsUploadingSheet] = useState(false);
  const [isDownloadingAccounts, setIsDownloadingAccounts] = useState(false);
  const [sendingCredentialId, setSendingCredentialId] = useState<string | null>(null);
  const [assigningStudentId, setAssigningStudentId] = useState<string | null>(
    null,
  );
  const [deletingProfessorId, setDeletingProfessorId] = useState<string | null>(
    null,
  );
  const [resettingProfessorId, setResettingProfessorId] = useState<string | null>(
    null,
  );
  const [settings, setSettings] = useState<RosterSettings>(DEFAULT_SETTINGS);
  const [profileState, setProfileState] = useState({
    display_name: "",
    username: "",
    email: "",
  });
  const [passwordState, setPasswordState] = useState({
    current: "",
    next: "",
    confirm: "",
  });

  const parseBulkRoster = (input: string) => {
    const rows = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed: Array<{ studentId: string; fullName: string; raw: string }> = [];

    rows.forEach((line) => {
      const tabParts = line.split("\t").map((p) => p.trim()).filter(Boolean);
      let studentId = "";
      let fullName = "";
      if (tabParts.length >= 2) {
        if (/^\d+$/.test(tabParts[0]) && tabParts.length >= 3) {
          studentId = tabParts[1];
          fullName = tabParts.slice(2).join(" ");
        } else {
          studentId = tabParts[0];
          fullName = tabParts.slice(1).join(" ");
        }
      } else {
        const parts = line.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          if (/^\d+$/.test(parts[0]) && parts.length >= 3) {
            studentId = parts[1];
            fullName = parts.slice(2).join(" ");
          } else {
            studentId = parts[0];
            fullName = parts.slice(1).join(" ");
          }
        }
      }
      if (!studentId || !fullName) {
        return;
      }
      const studentIdLower = studentId.toLowerCase();
      const fullNameLower = fullName.toLowerCase();
      if (
        studentIdLower === "username" ||
        studentIdLower === "student id" ||
        fullNameLower === "full name" ||
        fullNameLower === "name"
      ) {
        return;
      }
      parsed.push({ studentId, fullName, raw: line });
    });

    return parsed;
  };

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
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(`attendo.roster.settings.${user.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<RosterSettings>;
      setSettings({
        ...DEFAULT_SETTINGS,
        ...parsed,
      });
    } catch {
      setSettings(DEFAULT_SETTINGS);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(
      `attendo.roster.settings.${user.id}`,
      JSON.stringify(settings),
    );
  }, [settings, user?.id]);

  useEffect(() => {
    if (!user) return;
    setProfileState({
      display_name: user.display_name ?? "",
      username: user.username ?? "",
      email: user.email ?? "",
    });
  }, [user]);

  const coursesQuery = useQuery<{ courses: DashboardCourse[] }>({
    queryKey: ["professor", "courses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/professor/courses");
      return res.json();
    },
    enabled: isProfessor,
  });

  const rosterFilesQuery = useQuery<{ files: RosterFile[] }>({
    queryKey: ["professor", "roster-files"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/professor/roster-files");
      return res.json();
    },
    enabled: isProfessor,
  });

  const managedUsersQuery = useQuery<{ users: ManagedUser[] }>({
    queryKey: ["professor", "users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/professor/users");
      return res.json();
    },
    enabled: isProfessor,
  });

  const adminProfessorsQuery = useQuery<{ professors: AdminProfessor[] }>({
    queryKey: ["admin", "professors"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/professors");
      return res.json();
    },
    enabled: isAdmin,
  });

  const courseOptions = useMemo(() => {
    const courses = coursesQuery.data?.courses ?? [];
    return courses.map((course) => ({
      value: course.id,
      label: `${course.code} - ${course.name}`,
      groups: course.groups,
    }));
  }, [coursesQuery.data?.courses]);

  const groupOptions = useMemo(() => {
    const selectedCourse = courseOptions.find(
      (course) => course.value === selectedCourseId,
    );
    return (selectedCourse?.groups ?? []).map((group) => ({
      value: group.id,
      label: `${group.name}${group.meeting_schedule ? ` - ${group.meeting_schedule}` : ""}`,
    }));
  }, [courseOptions, selectedCourseId]);

  useEffect(() => {
    if (!selectedCourseId && courseOptions.length > 0) {
      setSelectedCourseId(courseOptions[0].value);
    }
  }, [selectedCourseId, courseOptions]);

  useEffect(() => {
    if (hasAppliedPrefillRef.current || !courseOptions.length) {
      return;
    }

    const hashQuery =
      typeof window !== "undefined" && window.location.hash.includes("?")
        ? window.location.hash.slice(window.location.hash.indexOf("?") + 1)
        : "";
    const pathQuery = location.includes("?") ? location.split("?")[1] : "";
    const params = new URLSearchParams(pathQuery || hashQuery);
    const prefillCourseId = params.get("courseId")?.trim() || "";
    const prefillGroupId = params.get("groupId")?.trim() || "";

    if (prefillCourseId && courseOptions.some((c) => c.value === prefillCourseId)) {
      setSelectedCourseId(prefillCourseId);
    }

    if (prefillGroupId) {
      setSelectedGroupId(prefillGroupId);
    }

    hasAppliedPrefillRef.current = true;
  }, [courseOptions, location]);

  useEffect(() => {
    if (!groupOptions.length) {
      setSelectedGroupId("");
      return;
    }
    if (!groupOptions.some((group) => group.value === selectedGroupId)) {
      setSelectedGroupId(groupOptions[0].value);
    }
  }, [groupOptions, selectedGroupId]);

  const enrollmentsQuery = useQuery<GroupEnrollmentsResponse>({
    queryKey: ["professor", "groups", selectedGroupId, "enrollments"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/professor/groups/${selectedGroupId}/enrollments`,
      );
      return res.json();
    },
    enabled: isProfessor && Boolean(selectedGroupId),
  });

  const invalidateRosterQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["professor", "courses"] }),
      queryClient.invalidateQueries({ queryKey: ["professor", "users"] }),
      queryClient.invalidateQueries({
        queryKey: ["professor", "groups", selectedGroupId, "enrollments"],
      }),
    ]);
  };

  const handleCreateAndEnroll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedGroupId) {
      toast({
        variant: "destructive",
        title: "Pick class and group",
        description: "Select a class group before enrolling students.",
      });
      return;
    }

    if (
      !createStudentState.display_name.trim() ||
      !createStudentState.username.trim() ||
      !createStudentState.password
    ) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Display name, username, and password are required.",
      });
      return;
    }
    if (createStudentState.password.length < 8) {
      toast({
        variant: "destructive",
        title: "Weak password",
        description: "Use at least 8 characters for student passwords.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/professor/users", {
        role: "student",
        display_name: createStudentState.display_name.trim(),
        username: createStudentState.username.trim(),
        password: createStudentState.password,
      });
      const createdUser: { id: string; username: string } = await res.json();

      await apiRequest(
        "POST",
        `/api/professor/groups/${selectedGroupId}/enrollments`,
        { studentId: createdUser.id },
      );

      toast({
        title: "Student enrolled",
        description: `${createdUser.username} is ready to scan attendance.`,
      });
      setCreateStudentState({
        display_name: "",
        username: "",
        password: "00000000",
      });
      await invalidateRosterQueries();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Enrollment failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateFromList = async () => {
    if (!selectedGroupId) {
      toast({
        variant: "destructive",
        title: "Pick class and group",
        description: "Select a class group before enrolling students.",
      });
      return;
    }

    const parsed = parseBulkRoster(bulkRosterText);
    if (!parsed.length) {
      toast({
        variant: "destructive",
        title: "No valid rows",
        description: "Paste rows like: 040223029<TAB>Ambra Boci",
      });
      return;
    }

    setIsSubmitting(true);
    const results: Array<{ row: string; status: "created" | "failed"; message: string }> = [];
    try {
      for (const row of parsed) {
        try {
          const res = await apiRequest("POST", "/api/professor/users", {
            role: "student",
            display_name: row.fullName,
            username: row.studentId,
            password: "00000000",
          });
          const createdUser: { id: string; username: string } = await res.json();
          await apiRequest(
            "POST",
            `/api/professor/groups/${selectedGroupId}/enrollments`,
            { studentId: createdUser.id },
          );
          results.push({
            row: row.raw,
            status: "created",
            message: `${createdUser.username} created with temporary password 00000000`,
          });
        } catch (error) {
          results.push({
            row: row.raw,
            status: "failed",
            message: error instanceof Error ? error.message : "Create failed",
          });
        }
      }

      setBulkResults(results);
      await invalidateRosterQueries();
      toast({
        title: "Bulk create complete",
        description: `${results.filter((r) => r.status === "created").length} students created.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadSheet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sheetFile) {
      toast({
        variant: "destructive",
        title: "Choose a file",
        description: "Upload an Excel or CSV student sheet first.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("sheet", sheetFile);
    if (selectedGroupId) {
      formData.append("groupId", selectedGroupId);
    }
    setIsUploadingSheet(true);

    try {
      const res = await fetch(buildApiUrl("/api/professor/roster-files/import"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Upload failed");
      }
      const result = (await res.json()) as RosterImportResult;
      setLastImport(result);
      const createdNow = result.created.filter((row) => !row.wasExisting).length;
      toast({
        title: "Students imported",
        description: `${createdNow} accounts created from ${sheetFile.name}.`,
      });
      setSheetFile(null);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
      await rosterFilesQuery.refetch();
      await invalidateRosterQueries();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsUploadingSheet(false);
    }
  };

  const handleRemove = async (enrollmentId: string) => {
    setIsSubmitting(true);
    try {
      await apiRequest("DELETE", `/api/professor/enrollments/${enrollmentId}`);
      toast({ title: "Student removed", description: "Enrollment deleted." });
      await invalidateRosterQueries();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Remove failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (studentId: string, username: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiRequest("PATCH", `/api/professor/users/${studentId}/password`);
      const result = (await res.json()) as { temporaryPassword: string };
      toast({
        title: "Password reset",
        description: `${username} temporary password: ${result.temporaryPassword}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Password reset failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendCredential = async (studentId: string) => {
    setSendingCredentialId(studentId);
    try {
      const res = await apiRequest(
        "GET",
        `/api/professor/users/${studentId}/credential`,
      );
      const data = (await res.json()) as {
        displayName: string;
        email: string;
        username: string;
        password: string;
        hasPassword: boolean;
      };
      if (!data.email) {
        throw new Error("Student email is missing.");
      }
      const subject = `Your attendance login credentials`;
      const body = [
        `Hello ${data.displayName},`,
        "",
        "Here are your login credentials:",
        `Username: ${data.username}`,
        `Email: ${data.email}`,
        `Password: ${data.password || "(password unavailable)"}`,
        "",
        "Please change your password after logging in.",
      ].join("\n");
      window.location.href = `mailto:${encodeURIComponent(
        data.email,
      )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Send failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSendingCredentialId(null);
    }
  };

  const handleAssignStudentToGroup = async (studentId: string, displayName: string) => {
    if (!selectedGroupId) {
      toast({
        variant: "destructive",
        title: "Pick a group",
        description: "Select a class and group before assigning students.",
      });
      return;
    }

    setAssigningStudentId(studentId);
    try {
      await apiRequest(
        "POST",
        `/api/professor/groups/${selectedGroupId}/enrollments`,
        { studentId },
      );
      toast({
        title: "Student assigned",
        description: `${displayName} was added to the selected group.`,
      });
      await invalidateRosterQueries();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Assign failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setAssigningStudentId(null);
    }
  };

  const handleDeleteProfessor = async (professor: AdminProfessor) => {
    if (!isAdmin) return;
    const confirm = window.confirm(
      `Delete ${professor.display_name} and all of their courses, sessions, and attendance data?`,
    );
    if (!confirm) return;

    setDeletingProfessorId(professor.id);
    try {
      await apiRequest("DELETE", `/api/admin/professors/${professor.id}`);
      toast({
        title: "Professor deleted",
        description: `${professor.display_name} was removed.`,
      });
      await adminProfessorsQuery.refetch();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setDeletingProfessorId(null);
    }
  };

  const handleResetProfessorPassword = async (professor: AdminProfessor) => {
    if (!isAdmin) return;
    const confirm = window.confirm(
      `Reset password for ${professor.display_name}? They will be required to change it on next login.`,
    );
    if (!confirm) return;

    setResettingProfessorId(professor.id);
    try {
      const res = await apiRequest(
        "PATCH",
        `/api/admin/professors/${professor.id}/password`,
      );
      const data = (await res.json()) as { temporaryPassword: string };
      toast({
        title: "Password reset",
        description: `Temporary password for ${professor.username}: ${data.temporaryPassword}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Reset failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setResettingProfessorId(null);
    }
  };

  const startEditUser = (target: ManagedUser) => {
    setEditingUserId(target.id);
    setEditState({
      username: target.username,
      email: target.email,
      display_name: target.display_name,
    });
  };

  const handleSaveUser = async (targetUserId: string) => {
    setIsSubmitting(true);
    try {
      await apiRequest("PATCH", `/api/professor/users/${targetUserId}`, editState);
      toast({
        title: "Account updated",
        description: "User details were saved.",
      });
      setEditingUserId(null);
      await managedUsersQuery.refetch();
      await invalidateRosterQueries();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadAccounts = async () => {
    setIsDownloadingAccounts(true);
    try {
      const res = await apiRequest("GET", "/api/professor/reports/accounts/export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "managed-students-accounts.csv";
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Download started",
        description: "Student accounts CSV is being downloaded.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsDownloadingAccounts(false);
    }
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id) return;
    setIsSubmitting(true);
    try {
      await apiRequest("PATCH", `/api/professor/users/${user.id}`, profileState);
      toast({
        title: "Profile updated",
        description: "Your profile details were saved.",
      });
      await managedUsersQuery.refetch();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordState.next !== passwordState.confirm) {
      toast({
        variant: "destructive",
        title: "Passwords do not match",
        description: "Confirm the new password correctly.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: passwordState.current,
        newPassword: passwordState.next,
      });
      toast({
        title: "Password updated",
        description: "Use the new password next time you log in.",
      });
      setPasswordState({ current: "", next: "", confirm: "" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Password change failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCourseLabel = enrollmentsQuery.data
    ? `${enrollmentsQuery.data.course.code} - ${enrollmentsQuery.data.course.name} / ${enrollmentsQuery.data.group.name}`
    : "Select a class and group";

  const setAllSections = (value: boolean) => {
    setSettings({
      showGroupPicker: value,
      showCreateEnroll: value,
      showUploadPanel: value,
      showEnrolledStudents: value,
    });
  };

  return (
    <Layout role="professor">
      <div className="space-y-8 animate-in-up">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-heading font-bold text-primary mb-2">
              Roster
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage students, upload class sheets, and control what tools are visible.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-muted-foreground" />
            <Badge variant="outline" className="font-mono">
              {enrollmentsQuery.data?.enrollments.length ?? 0} enrolled
            </Badge>
          </div>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-primary" />
              Professor settings
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Toggle any roster section on/off. Your choices are saved for this account.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
                <Label htmlFor="toggle-group-picker">Pick class + group</Label>
                <Switch
                  id="toggle-group-picker"
                  checked={settings.showGroupPicker}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showGroupPicker: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
                <Label htmlFor="toggle-create-enroll">Create + enroll student</Label>
                <Switch
                  id="toggle-create-enroll"
                  checked={settings.showCreateEnroll}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showCreateEnroll: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
                <Label htmlFor="toggle-upload-sheet">Upload students sheet</Label>
                <Switch
                  id="toggle-upload-sheet"
                  checked={settings.showUploadPanel}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showUploadPanel: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2 md:col-span-2">
                <Label htmlFor="toggle-enrolled-list">Enrolled students table</Label>
                <Switch
                  id="toggle-enrolled-list"
                  checked={settings.showEnrolledStudents}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showEnrolledStudents: checked }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setAllSections(false)}>
                Hide all sections
              </Button>
              <Button type="button" variant="outline" onClick={() => setAllSections(true)}>
                Show all sections
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>My profile</CardTitle>
            <p className="text-sm text-muted-foreground">
              Update your display name and change your password.
            </p>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <form className="space-y-3" onSubmit={handleSaveProfile}>
              <div className="space-y-1">
                <Label htmlFor="profile-display-name">Display name</Label>
                <Input
                  id="profile-display-name"
                  value={profileState.display_name}
                  onChange={(event) =>
                    setProfileState((prev) => ({
                      ...prev,
                      display_name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="profile-username">Username</Label>
                <Input
                  id="profile-username"
                  value={profileState.username}
                  onChange={(event) =>
                    setProfileState((prev) => ({
                      ...prev,
                      username: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="profile-email">Email</Label>
                <Input
                  id="profile-email"
                  value={profileState.email}
                  onChange={(event) =>
                    setProfileState((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                />
              </div>
              <Button type="submit" disabled={isSubmitting}>
                Save profile
              </Button>
            </form>

            <form className="space-y-3" onSubmit={handleChangePassword}>
              <div className="space-y-1">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={passwordState.current}
                  onChange={(event) =>
                    setPasswordState((prev) => ({
                      ...prev,
                      current: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={passwordState.next}
                  onChange={(event) =>
                    setPasswordState((prev) => ({
                      ...prev,
                      next: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={passwordState.confirm}
                  onChange={(event) =>
                    setPasswordState((prev) => ({
                      ...prev,
                      confirm: event.target.value,
                    }))
                  }
                />
              </div>
              <Button type="submit" variant="outline" disabled={isSubmitting}>
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>

        {settings.showGroupPicker && (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Pick class and group</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose which class and group you want to manage.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="course-select">Class</Label>
                <Select
                  value={selectedCourseId}
                  onValueChange={setSelectedCourseId}
                  disabled={coursesQuery.isLoading || courseOptions.length === 0}
                >
                  <SelectTrigger id="course-select" className="h-11">
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {courseOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-select">Group</Label>
                <Select
                  value={selectedGroupId}
                  onValueChange={setSelectedGroupId}
                  disabled={coursesQuery.isLoading || groupOptions.length === 0}
                >
                  <SelectTrigger id="group-select" className="h-11">
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Current: <span className="text-foreground">{selectedCourseLabel}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {settings.showCreateEnroll && (
          <div className="grid gap-6">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5" /> Create + enroll student
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Creates the login and enrolls them in the selected group.
                </p>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleCreateAndEnroll}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="student-display-name">Display name</Label>
                        <Input
                          id="student-display-name"
                          value={createStudentState.display_name}
                          onChange={(event) =>
                            setCreateStudentState((prev) => ({
                              ...prev,
                              display_name: event.target.value,
                            }))
                          }
                          placeholder="Full name"
                          autoComplete="name"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="student-username">Student ID</Label>
                        <Input
                          id="student-username"
                          value={createStudentState.username}
                          onChange={(event) =>
                            setCreateStudentState((prev) => ({
                              ...prev,
                              username: event.target.value,
                            }))
                          }
                          placeholder="Student ID"
                          autoComplete="username"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="student-password">Temporary password</Label>
                      <div className="flex gap-2">
                        <Input
                          id="student-password"
                          value={createStudentState.password}
                          onChange={(event) =>
                            setCreateStudentState((prev) => ({
                              ...prev,
                              password: event.target.value,
                            }))
                          }
                          placeholder="00000000"
                          type="password"
                          autoComplete="new-password"
                          required
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setCreateStudentState((prev) => ({
                              ...prev,
                              password: "00000000",
                            }))
                          }
                        >
                          Use standard
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Default temporary password is 00000000.
                      </p>
                    </div>
                    <Button
                      type="submit"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Saving..." : "Create & enroll"}
                    </Button>
                </form>

                <div className="mt-6 space-y-3 rounded-lg border border-border/70 p-4">
                    <p className="text-sm font-medium">Quick create from list</p>
                    <p className="text-xs text-muted-foreground">
                      Paste rows like: username TAB full name. Header row is optional.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="quick-course-select">Class</Label>
                        <Select
                          value={selectedCourseId}
                          onValueChange={setSelectedCourseId}
                          disabled={coursesQuery.isLoading || courseOptions.length === 0}
                        >
                          <SelectTrigger id="quick-course-select" className="h-10">
                            <SelectValue placeholder="Select a class" />
                          </SelectTrigger>
                          <SelectContent>
                            {courseOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="quick-group-select">Group</Label>
                        <Select
                          value={selectedGroupId}
                          onValueChange={setSelectedGroupId}
                          disabled={coursesQuery.isLoading || groupOptions.length === 0}
                        >
                          <SelectTrigger id="quick-group-select" className="h-10">
                            <SelectValue placeholder="Select a group" />
                          </SelectTrigger>
                          <SelectContent>
                            {groupOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Students will be assigned to this group.
                        </p>
                      </div>
                    </div>
                    <textarea
                      className="min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                      placeholder={"username\tFull Name\n040223029\tAmbra Boci\n040223058\tAnas Abusifritah"}
                      value={bulkRosterText}
                      onChange={(event) => setBulkRosterText(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={handleCreateFromList}
                    >
                      Create from list
                    </Button>
                    {bulkResults.length > 0 && (
                      <div className="max-h-56 space-y-2 overflow-auto text-xs">
                        {bulkResults.map((row, idx) => (
                          <div
                            key={`${row.row}-${idx}`}
                            className={`rounded-md border px-3 py-2 ${
                              row.status === "created"
                                ? "border-primary/40 text-primary"
                                : "border-destructive text-destructive"
                            }`}
                          >
                            <p className="font-medium">{row.row}</p>
                            <p className="text-muted-foreground">{row.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {settings.showUploadPanel && (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload student sheet
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload Excel/CSV files with username + full name columns (email optional) to auto-create students and enroll them in the selected group.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <form className="space-y-3" onSubmit={handleUploadSheet}>
                <div className="space-y-1">
                  <Label htmlFor="sheet-file">Excel or CSV file</Label>
                  <p className="text-xs text-muted-foreground">
                    Required columns: username, full name. Optional: email.
                  </p>
                  <Input
                    id="sheet-file"
                    ref={uploadInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(event) => setSheetFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <Button type="submit" disabled={isUploadingSheet}>
                  {isUploadingSheet ? "Importing..." : "Import sheet and create accounts"}
                </Button>
              </form>

              {lastImport && (
                <div className="space-y-2 rounded-lg border border-border/70 p-3">
                  <p className="text-sm font-medium">Latest imported accounts</p>
                  <div className="max-h-56 space-y-2 overflow-auto">
                    {lastImport.created.map((row) => (
                      <div
                        key={`${row.id}-${row.email}`}
                        className="rounded-md border border-border/70 px-3 py-2 text-xs"
                      >
                        <p>
                          <span className="font-medium">{row.display_name}</span> ({row.username}) - {row.email}
                        </p>
                        <p className="text-muted-foreground">
                          {row.wasExisting
                            ? "Existing student reused"
                            : `Temporary password: ${row.temporaryPassword}`}{" "}
                          {row.enrolled ? "- enrolled" : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-sm font-medium">Saved files</p>
                {rosterFilesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading uploads...</p>
                ) : rosterFilesQuery.data?.files.length ? (
                  <div className="space-y-2">
                    {rosterFilesQuery.data.files.map((file) => (
                      <div
                        key={file.fileName}
                        className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{file.originalName}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(file.uploadedAt).toLocaleString()} - {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <a href={`/api/professor/roster-files/${encodeURIComponent(file.fileName)}`}>
                            <Download className="w-4 h-4 mr-1" />
                            Download
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No uploaded sheets yet.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {settings.showEnrolledStudents && (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Enrolled students</CardTitle>
              <p className="text-sm text-muted-foreground">
                These students can scan attendance in the selected group.
              </p>
            </CardHeader>
            <CardContent>
              {enrollmentsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading roster...</p>
              ) : enrollmentsQuery.data?.enrollments.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Password</TableHead>
                      <TableHead className="w-28"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrollmentsQuery.data.enrollments.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.student.display_name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.student.username}
                        </TableCell>
                        <TableCell>
                          {row.role === "student" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                assigningStudentId === row.id ||
                                !selectedGroupId ||
                                alreadyInSelectedGroup
                              }
                              onClick={() =>
                                handleAssignStudentToGroup(row.id, row.display_name)
                              }
                            >
                              {alreadyInSelectedGroup
                                ? "Assigned"
                                : assigningStudentId === row.id
                                  ? "Assigning..."
                                  : "Assign"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">â€”</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSubmitting}
                            onClick={() =>
                              handleResetPassword(row.student.id, row.student.username)
                            }
                          >
                            Reset
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isSubmitting}
                            onClick={() => handleRemove(row.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No students enrolled yet.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Manage accounts</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadAccounts}
                disabled={isDownloadingAccounts}
              >
                <Download className="mr-2 h-4 w-4" />
                {isDownloadingAccounts ? "Downloading..." : "Download accounts CSV"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              View and edit your managed users. Use Assign to add students to the selected group above.
            </p>
          </CardHeader>
          <CardContent>
            {managedUsersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading accounts...</p>
            ) : managedUsersQuery.data?.users.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Display name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Classes</TableHead>
                    <TableHead>Groups</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead>Send</TableHead>
                    <TableHead>Assign</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managedUsersQuery.data.users.map((row) => {
                    const editing = editingUserId === row.id;
                    const alreadyInSelectedGroup =
                      row.role === "student" &&
                      row.assignments.some(
                        (assignment) => assignment.groupId === selectedGroupId,
                      );
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Badge variant={row.role === "professor" ? "secondary" : "outline"}>
                            {row.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {editing ? (
                            <Input
                              value={editState.display_name}
                              onChange={(event) =>
                                setEditState((prev) => ({
                                  ...prev,
                                  display_name: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            row.display_name
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {editing ? (
                            <Input
                              value={editState.username}
                              onChange={(event) =>
                                setEditState((prev) => ({
                                  ...prev,
                                  username: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            row.username
                          )}
                        </TableCell>
                        <TableCell>
                          {editing ? (
                            <Input
                              value={editState.email}
                              onChange={(event) =>
                                setEditState((prev) => ({
                                  ...prev,
                                  email: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            row.email
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.role === "student" && row.assignments.length
                            ? row.assignments.map((a) => a.courseCode).join(", ")
                            : row.role === "student"
                              ? "Not assigned"
                              : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.role === "student" && row.assignments.length
                            ? row.assignments
                                .map((a) => `${a.courseCode}:${a.groupName}`)
                                .join(", ")
                            : row.role === "student"
                              ? "Not assigned"
                              : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.last_login_at
                            ? new Date(row.last_login_at).toLocaleString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          {row.role === "student" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={sendingCredentialId === row.id}
                              onClick={() => handleSendCredential(row.id)}
                            >
                              <Mail className="w-4 h-4 mr-1" />
                              {sendingCredentialId === row.id ? "Sending..." : "Send"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editing ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={isSubmitting}
                                onClick={() => handleSaveUser(row.id)}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isSubmitting}
                                onClick={() => setEditingUserId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditUser(row)}
                            >
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No managed users found.</p>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Professor accounts</CardTitle>
              <p className="text-sm text-muted-foreground">
                Admins can review professor profiles and remove accounts when needed.
              </p>
            </CardHeader>
            <CardContent>
              {adminProfessorsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading professors...</p>
              ) : adminProfessorsQuery.data?.professors.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Courses</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead>Last login</TableHead>
                      <TableHead className="w-40"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminProfessorsQuery.data.professors.map((professor) => (
                      <TableRow key={professor.id}>
                        <TableCell className="font-medium">
                          {professor.display_name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {professor.username}
                        </TableCell>
                        <TableCell>{professor.email}</TableCell>
                        <TableCell>{professor.courseCount}</TableCell>
                        <TableCell>{professor.studentCount}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {professor.last_login_at
                            ? new Date(professor.last_login_at).toLocaleString()
                            : "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={resettingProfessorId === professor.id}
                              onClick={() => handleResetProfessorPassword(professor)}
                            >
                              Reset
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deletingProfessorId === professor.id}
                              onClick={() => handleDeleteProfessor(professor)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No professor accounts found.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
