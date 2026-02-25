import { Users, UserPlus, Trash2, SlidersHorizontal, Upload, Download } from "lucide-react";
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
import { apiRequest } from "@/lib/queryClient";

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
      email: string;
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
};

type RosterSettings = {
  showGroupPicker: boolean;
  showCreateEnroll: boolean;
  showEnrollExisting: boolean;
  showUploadPanel: boolean;
  showEnrolledStudents: boolean;
};

const DEFAULT_SETTINGS: RosterSettings = {
  showGroupPicker: true,
  showCreateEnroll: true,
  showEnrollExisting: true,
  showUploadPanel: true,
  showEnrolledStudents: true,
};

export default function ProfessorRoster() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: user } = useCurrentUser();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [createStudentState, setCreateStudentState] = useState({
    display_name: "",
    username: "",
    email: "",
    password: "",
  });
  const [enrollExistingIdentifier, setEnrollExistingIdentifier] = useState("");
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
  const [settings, setSettings] = useState<RosterSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (user === null) {
      setLocation("/professor/login");
      return;
    }
    if (user && user.role !== "professor") {
      setLocation("/professor/login");
    }
  }, [user, setLocation]);

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

  const coursesQuery = useQuery<{ courses: DashboardCourse[] }>({
    queryKey: ["professor", "courses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/professor/courses");
      return res.json();
    },
    enabled: user?.role === "professor",
  });

  const rosterFilesQuery = useQuery<{ files: RosterFile[] }>({
    queryKey: ["professor", "roster-files"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/professor/roster-files");
      return res.json();
    },
    enabled: user?.role === "professor",
  });

  const managedUsersQuery = useQuery<{ users: ManagedUser[] }>({
    queryKey: ["professor", "users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/professor/users");
      return res.json();
    },
    enabled: user?.role === "professor",
  });

  const groupOptions = useMemo(() => {
    const courses = coursesQuery.data?.courses ?? [];
    return courses.flatMap((course) =>
      course.groups.map((group) => ({
        value: group.id,
        label: `${course.code} - ${course.name} - ${group.name}`,
      })),
    );
  }, [coursesQuery.data?.courses]);

  useEffect(() => {
    if (!selectedGroupId && groupOptions.length > 0) {
      setSelectedGroupId(groupOptions[0].value);
    }
  }, [selectedGroupId, groupOptions]);

  const enrollmentsQuery = useQuery<GroupEnrollmentsResponse>({
    queryKey: ["professor", "groups", selectedGroupId, "enrollments"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/professor/groups/${selectedGroupId}/enrollments`,
      );
      return res.json();
    },
    enabled: user?.role === "professor" && Boolean(selectedGroupId),
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
        title: "Pick a group",
        description: "Select a course group before enrolling students.",
      });
      return;
    }

    if (
      !createStudentState.display_name.trim() ||
      !createStudentState.username.trim() ||
      !createStudentState.email.trim() ||
      !createStudentState.password
    ) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Display name, username, email, and password are required.",
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
        ...createStudentState,
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
      setCreateStudentState({ display_name: "", username: "", email: "", password: "" });
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

  const handleEnrollExisting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedGroupId) {
      toast({
        variant: "destructive",
        title: "Pick a group",
        description: "Select a course group before enrolling students.",
      });
      return;
    }

    const identifier = enrollExistingIdentifier.trim();
    if (!identifier) {
      toast({
        variant: "destructive",
        title: "Missing student",
        description: "Enter a student's username or email.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = identifier.includes("@")
        ? { email: identifier }
        : { username: identifier };
      const res = await apiRequest(
        "POST",
        `/api/professor/groups/${selectedGroupId}/enrollments`,
        payload,
      );
      const result: { moved: boolean; created: boolean } = await res.json();

      toast({
        title: result.created ? "Student enrolled" : result.moved ? "Enrollment updated" : "Already enrolled",
        description: result.moved
          ? "Student moved to this group."
          : result.created
            ? "Student added to this group."
            : "Student is already in this group.",
      });
      setEnrollExistingIdentifier("");
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
      const res = await fetch("/api/professor/roster-files/import", {
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
    const password = window.prompt(
      `Enter a new password for ${username}, or leave empty to auto-generate one.`,
      "",
    );
    if (password === null) {
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest(
        "PATCH",
        `/api/professor/users/${studentId}/password`,
        password.trim() ? { password } : {},
      );
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

  const selectedCourseLabel = enrollmentsQuery.data
    ? `${enrollmentsQuery.data.course.code} - ${enrollmentsQuery.data.course.name}`
    : "Select a group";

  const setAllSections = (value: boolean) => {
    setSettings({
      showGroupPicker: value,
      showCreateEnroll: value,
      showEnrollExisting: value,
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
                <Label htmlFor="toggle-group-picker">Pick a group</Label>
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
                <Label htmlFor="toggle-enroll-existing">Enroll existing student</Label>
                <Switch
                  id="toggle-enroll-existing"
                  checked={settings.showEnrollExisting}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showEnrollExisting: checked }))
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

        {settings.showGroupPicker && (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Pick a group</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose which group you want to manage.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
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

        {(settings.showCreateEnroll || settings.showEnrollExisting) && (
          <div className="grid gap-6 md:grid-cols-2">
            {settings.showCreateEnroll && (
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
                        <Label htmlFor="student-username">Username</Label>
                        <Input
                          id="student-username"
                          value={createStudentState.username}
                          onChange={(event) =>
                            setCreateStudentState((prev) => ({
                              ...prev,
                              username: event.target.value,
                            }))
                          }
                          placeholder="username"
                          autoComplete="username"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="student-email">Email</Label>
                        <Input
                          id="student-email"
                          value={createStudentState.email}
                          onChange={(event) =>
                            setCreateStudentState((prev) => ({
                              ...prev,
                              email: event.target.value,
                            }))
                          }
                          placeholder="student@university.edu"
                          autoComplete="email"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="student-password">Password</Label>
                        <Input
                          id="student-password"
                          value={createStudentState.password}
                          onChange={(event) =>
                            setCreateStudentState((prev) => ({
                              ...prev,
                              password: event.target.value,
                            }))
                          }
                          placeholder="Temporary password"
                          type="password"
                          autoComplete="new-password"
                          required
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Saving..." : "Create & enroll"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {settings.showEnrollExisting && (
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle>Enroll existing student</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Enter username or email to enroll (or move) them to this group.
                  </p>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleEnrollExisting}>
                    <div className="space-y-1">
                      <Label htmlFor="existing-student">Username or email</Label>
                      <Input
                        id="existing-student"
                        value={enrollExistingIdentifier}
                        onChange={(event) => setEnrollExistingIdentifier(event.target.value)}
                        placeholder="alice or alice@university.edu"
                      />
                    </div>
                    <Button type="submit" variant="outline" disabled={isSubmitting}>
                      Enroll
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
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
                Upload Excel/CSV files to auto-create students and enroll them in the selected group.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <form className="space-y-3" onSubmit={handleUploadSheet}>
                <div className="space-y-1">
                  <Label htmlFor="sheet-file">Excel or CSV file</Label>
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
                      <TableHead>Email</TableHead>
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
                        <TableCell className="text-muted-foreground">
                          {row.student.email}
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
              View and edit your managed users. Students can still change their own passwords.
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
                    <TableHead>Last login</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managedUsersQuery.data.users.map((row) => {
                    const editing = editingUserId === row.id;
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
                          {row.last_login_at
                            ? new Date(row.last_login_at).toLocaleString()
                            : "Never"}
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
      </div>
    </Layout>
  );
}
