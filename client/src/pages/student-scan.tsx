import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Layout from "@/components/layout";
import QRScanner, { type ScanResult } from "@/components/qr-scanner";
import { apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { deleteQueuedScan, getQueueCount, getQueuedScans, queueScan } from "@/lib/offlineQueue";

type EnrollmentResponse = {
  enrollments: Array<{
    enrollmentId: string;
    course: {
      id: string;
      code: string;
      name: string;
      term: string;
    };
    group: {
      id: string;
      name: string;
      meeting_schedule: string | null;
    };
  }>;
};

type AttendanceResponse = {
  attendance: Array<{
    courseId: string;
    courseName: string;
    totalRounds: number;
    attendedRounds: number;
    attendancePercentage: number;
  }>;
};

type AttendanceHistoryResponse = {
  history: Array<{
    recordId: string;
    recordedAt: string;
    status: string;
    roundId: string;
    roundNumber: number;
    courseName: string;
    groupName: string;
  }>;
};

type ScanFeedItem = {
  id: string;
  time: string;
  status: "saved" | "synced" | "failed";
  message: string;
};

export default function StudentScan() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  const [queuedCount, setQueuedCount] = useState(0);
  const [offlineStatus, setOfflineStatus] = useState<
    "idle" | "saved" | "syncing" | "failed" | "synced"
  >("idle");
  const [passwordState, setPasswordState] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [scanFeed, setScanFeed] = useState<ScanFeedItem[]>([]);
  const [manualClassId, setManualClassId] = useState("");
  const [submittingManualCheckIn, setSubmittingManualCheckIn] = useState(false);

  const deviceFingerprint = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const key = "classscan_device_fp";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fp = crypto.randomUUID();
    localStorage.setItem(key, fp);
    return fp;
  }, []);

  const enrollmentsQuery = useQuery<EnrollmentResponse>({
    queryKey: ["student", "enrollments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/enrollments");
      return res.json();
    },
    enabled: user?.role === "student",
  });

  const attendanceQuery = useQuery<AttendanceResponse>({
    queryKey: ["student", "attendance"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/attendance");
      return res.json();
    },
    enabled: user?.role === "student",
  });

  const attendanceHistoryQuery = useQuery<AttendanceHistoryResponse>({
    queryKey: ["student", "attendance", "history"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/attendance/history");
      return res.json();
    },
    enabled: user?.role === "student",
  });

  const refreshQueueCount = useCallback(async () => {
    try {
      setQueuedCount(await getQueueCount());
    } catch {
      setQueuedCount(0);
    }
  }, []);

  const syncQueued = useCallback(async () => {
    const scans = await getQueuedScans();
    if (!scans.length) {
      setOfflineStatus("idle");
      await refreshQueueCount();
      return;
    }

    setOfflineStatus("syncing");
    for (const scan of scans) {
      try {
        const res = await fetch(`/api/rounds/${scan.roundId}/scans`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: scan.token,
            latitude: scan.latitude,
            longitude: scan.longitude,
            deviceFingerprint: scan.deviceFingerprint,
            client_scan_id: scan.client_scan_id,
            offlineCapturedAt: scan.capturedAt,
          }),
        });

        if (res.ok) {
          await deleteQueuedScan(scan.client_scan_id);
          continue;
        }

        let body: any = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        const code = body?.code as string | undefined;
        if (code === "token_expired" || code === "token_already_consumed") {
          await deleteQueuedScan(scan.client_scan_id);
          setScanFeed((prev) => [
            {
              id: crypto.randomUUID(),
              time: new Date().toISOString(),
              status: "failed",
              message: "Queued scan expired before sync.",
            },
            ...prev,
          ].slice(0, 20));
          continue;
        }
        setOfflineStatus("failed");
        setScanFeed((prev) => [
          {
            id: crypto.randomUUID(),
            time: new Date().toISOString(),
            status: "failed",
            message: "Queued scan sync failed.",
          },
          ...prev,
        ].slice(0, 20));
        return;
      } catch {
        setOfflineStatus("failed");
        setScanFeed((prev) => [
          {
            id: crypto.randomUUID(),
            time: new Date().toISOString(),
            status: "failed",
            message: "No internet. Could not sync queued scan.",
          },
          ...prev,
        ].slice(0, 20));
        return;
      }

      setScanFeed((prev) => [
        {
          id: crypto.randomUUID(),
          time: new Date().toISOString(),
          status: "synced",
          message: "Queued scan synced successfully.",
        },
        ...prev,
      ].slice(0, 20));
    }

    setOfflineStatus("synced");
    await refreshQueueCount();
    await attendanceQuery.refetch();
    await attendanceHistoryQuery.refetch();
  }, [attendanceHistoryQuery, attendanceQuery, refreshQueueCount]);

  useEffect(() => {
    if (user === null) {
      setLocation("/student/login");
      return;
    }
    if (user && user.role !== "student") {
      setLocation("/student/login");
    }
  }, [user, setLocation]);

  useEffect(() => {
    if (!selectedEnrollmentId && enrollmentsQuery.data?.enrollments?.length) {
      setSelectedEnrollmentId(enrollmentsQuery.data.enrollments[0].enrollmentId);
    }
  }, [selectedEnrollmentId, enrollmentsQuery.data]);

  useEffect(() => {
    refreshQueueCount();
    syncQueued();
    const onlineHandler = () => syncQueued();
    window.addEventListener("online", onlineHandler);
    return () => window.removeEventListener("online", onlineHandler);
  }, [refreshQueueCount, syncQueued]);

  const selectedEnrollment = useMemo(
    () =>
      enrollmentsQuery.data?.enrollments.find(
        (item) => item.enrollmentId === selectedEnrollmentId,
      ),
    [enrollmentsQuery.data, selectedEnrollmentId],
  );

  const attendanceSummary = attendanceQuery.data?.attendance ?? [];
  const overallAttendance = attendanceSummary.length
    ? Math.round(
        attendanceSummary.reduce((sum, item) => sum + item.attendancePercentage, 0) /
          attendanceSummary.length,
      )
    : 0;

  const handleScan = useCallback(
    async (data: string): Promise<ScanResult> => {
      const capturedAt = new Date().toISOString();
      const clientScanId = crypto.randomUUID();

      try {
        const parsed = JSON.parse(data);
        const roundId = parsed.roundId;
        const token = parsed.token;
        if (!roundId || !token) {
          throw new Error("Invalid QR payload");
        }

        let coords: { latitude: number; longitude: number } | undefined;
        try {
          coords = await new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error("Geolocation unavailable"));
            navigator.geolocation.getCurrentPosition(
              (pos) =>
                resolve({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                }),
              (err) => reject(err),
              { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
            );
          });
        } catch {
          // Scan still proceeds without coordinates when geolocation is unavailable.
        }

        const body = {
          token,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          deviceFingerprint,
          client_scan_id: clientScanId,
          offlineCapturedAt: capturedAt,
        };

        if (!navigator.onLine) {
          await queueScan({
            client_scan_id: clientScanId,
            roundId,
            token,
            latitude: coords?.latitude,
            longitude: coords?.longitude,
            deviceFingerprint: deviceFingerprint ?? undefined,
            capturedAt,
          });
          setOfflineStatus("saved");
          refreshQueueCount();
          setScanFeed((prev) => [
            {
              id: crypto.randomUUID(),
              time: new Date().toISOString(),
              status: "saved",
              message: "Scan saved offline.",
            },
            ...prev,
          ].slice(0, 20));
          return { success: true, message: "Saved offline." };
        }

        const res = await fetch(`/api/rounds/${roundId}/scans`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.message ?? "Could not record attendance.");
        }

        toast({ title: "Attendance recorded", description: "You are checked in." });
        attendanceQuery.refetch();
        attendanceHistoryQuery.refetch();
        setScanFeed((prev) => [
          {
            id: crypto.randomUUID(),
            time: new Date().toISOString(),
            status: "synced",
            message: "Scan saved on server.",
          },
          ...prev,
        ].slice(0, 20));
        return { success: true, message: "Attendance recorded successfully." };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Scan failed.";
        toast({ variant: "destructive", title: "Scan failed", description: message });
        setScanFeed((prev) => [
          {
            id: crypto.randomUUID(),
            time: new Date().toISOString(),
            status: "failed",
            message,
          },
          ...prev,
        ].slice(0, 20));
        return { success: false, message };
      }
    },
    [
      attendanceHistoryQuery,
      attendanceQuery,
      deviceFingerprint,
      refreshQueueCount,
      toast,
    ],
  );

  const isAuthenticated = user?.role === "student";
  const recentHistory = (attendanceHistoryQuery.data?.history ?? []).slice(0, 8);
  const offlineLabel =
    offlineStatus === "idle"
      ? "Ready"
      : offlineStatus === "saved"
        ? "Saved offline"
        : offlineStatus === "syncing"
          ? "Syncing"
          : offlineStatus === "failed"
            ? "Sync failed"
            : "Synced";

  const handleManualCheckIn = async () => {
    const classId = manualClassId.trim();
    if (!classId) {
      toast({
        variant: "destructive",
        title: "Class ID required",
        description: "Enter a class ID before manual check-in.",
      });
      return;
    }

    setSubmittingManualCheckIn(true);
    try {
      await apiRequest("POST", "/api/me/manual-checkin", { classId });
      toast({
        title: "Manual check-in saved",
        description: "Your attendance was saved using class ID.",
      });
      setManualClassId("");
      await Promise.all([
        attendanceQuery.refetch(),
        attendanceHistoryQuery.refetch(),
      ]);
      setScanFeed((prev) => [
        {
          id: crypto.randomUUID(),
          time: new Date().toISOString(),
          status: "synced",
          message: "Manual class ID check-in saved.",
        },
        ...prev,
      ].slice(0, 20));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Manual check-in failed.";
      toast({
        variant: "destructive",
        title: "Manual check-in failed",
        description: message,
      });
      setScanFeed((prev) => [
        {
          id: crypto.randomUUID(),
          time: new Date().toISOString(),
          status: "failed",
          message,
        },
        ...prev,
      ].slice(0, 20));
    } finally {
      setSubmittingManualCheckIn(false);
    }
  };

  return (
    <Layout role="student">
      <div className="max-w-5xl mx-auto space-y-6 animate-in-up">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-heading font-bold text-primary">Student Portal</h1>
            <p className="text-muted-foreground">Pick a class and scan the QR code.</p>
          </div>
        </div>

        {!isAuthenticated ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Redirecting to login</CardTitle>
            </CardHeader>
            <CardContent>
              <Button type="button" onClick={() => setLocation("/student/login")}>
                Go to login
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle>Pick your subject</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select
                    value={selectedEnrollmentId}
                    onValueChange={setSelectedEnrollmentId}
                    disabled={enrollmentsQuery.isLoading}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select a course" />
                    </SelectTrigger>
                    <SelectContent>
                      {enrollmentsQuery.data?.enrollments.map((item) => (
                        <SelectItem key={item.enrollmentId} value={item.enrollmentId}>
                          {item.course.code} - {item.course.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedEnrollment && (
                    <div className="rounded-lg border border-border/70 px-3 py-2 text-sm">
                      <p className="font-medium">{selectedEnrollment.course.name}</p>
                      <p className="text-muted-foreground">
                        Group {selectedEnrollment.group.name} -{" "}
                        {selectedEnrollment.group.meeting_schedule ??
                          selectedEnrollment.course.term}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle>Your status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-3xl font-bold text-primary">{overallAttendance}%</p>
                  <p className="text-sm text-muted-foreground">
                    Overall attendance across {attendanceSummary.length} classes
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Offline queue: {queuedCount} - {offlineLabel}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <Card className="border-border/70 shadow-sm order-2 lg:order-1">
                <CardHeader>
                  <CardTitle>Live Scan Feed</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Shows if each scan was saved or failed.
                  </p>
                </CardHeader>
                <CardContent>
                  {scanFeed.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No scan activity yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
                      {scanFeed.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-border/70 bg-background/60 p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge
                              variant="outline"
                              className={
                                item.status === "synced"
                                  ? "border-emerald-500 text-emerald-600"
                                  : item.status === "saved"
                                    ? "border-amber-500 text-amber-600"
                                    : "border-destructive text-destructive"
                              }
                            >
                              {item.status}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(item.time).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{item.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4 order-1 lg:order-2">
                {selectedEnrollment ? (
                  <Card className="border-border/70 shadow-sm">
                    <CardHeader>
                      <CardTitle>Check In</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {selectedEnrollment.course.code} - {selectedEnrollment.course.name}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <QRScanner onScan={handleScan} />
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-border/70 shadow-sm">
                    <CardHeader>
                      <CardTitle>Ready to scan</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Select a class first to unlock the QR scanner.
                      </p>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-border/70 shadow-sm">
                  <CardHeader>
                    <CardTitle>Manual Class ID (Testing)</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      If camera does not work, enter class ID manually to test check-in.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="manual-class-id">Class ID</Label>
                      <Input
                        id="manual-class-id"
                        value={manualClassId}
                        onChange={(event) => setManualClassId(event.target.value)}
                        placeholder="Paste active class ID"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleManualCheckIn}
                      disabled={submittingManualCheckIn}
                    >
                      {submittingManualCheckIn ? "Saving..." : "Manual check-in"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="border-border/70 shadow-sm" aria-busy={attendanceHistoryQuery.isFetching}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recent Attendance</CardTitle>
                {attendanceHistoryQuery.isFetching && (
                  <Badge variant="secondary" className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Syncing
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                {attendanceHistoryQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading history...</p>
                ) : recentHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No attendance records yet.</p>
                ) : (
                  <div className="space-y-3">
                    {recentHistory.map((entry) => (
                      <div
                        key={entry.recordId}
                        className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/70 p-3"
                      >
                        <div className="h-9 w-9 shrink-0 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{entry.courseName}</p>
                          <p className="text-xs text-muted-foreground">
                            Group {entry.groupName} - Round {entry.roundNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.recordedAt).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant="outline">{entry.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Change password</CardTitle>
                {user?.must_change_password && (
                  <p className="text-sm text-muted-foreground">
                    Your password was reset by a professor. Please set a new one.
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-3 md:grid-cols-4"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (passwordState.newPassword !== passwordState.confirmPassword) {
                      toast({
                        variant: "destructive",
                        title: "Password mismatch",
                        description: "New password and confirmation do not match.",
                      });
                      return;
                    }
                    setChangingPassword(true);
                    try {
                      await apiRequest("POST", "/api/auth/change-password", {
                        currentPassword: passwordState.currentPassword,
                        newPassword: passwordState.newPassword,
                      });
                      await queryClient.invalidateQueries({ queryKey: ["me"] });
                      setPasswordState({
                        currentPassword: "",
                        newPassword: "",
                        confirmPassword: "",
                      });
                      toast({
                        title: "Password changed",
                        description: "Your new password is saved.",
                      });
                    } catch (error) {
                      toast({
                        variant: "destructive",
                        title: "Could not change password",
                        description:
                          error instanceof Error ? error.message : "Please try again.",
                      });
                    } finally {
                      setChangingPassword(false);
                    }
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={passwordState.currentPassword}
                      onChange={(event) =>
                        setPasswordState((prev) => ({
                          ...prev,
                          currentPassword: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={passwordState.newPassword}
                      onChange={(event) =>
                        setPasswordState((prev) => ({
                          ...prev,
                          newPassword: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={passwordState.confirmPassword}
                      onChange={(event) =>
                        setPasswordState((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={changingPassword}>
                      {changingPassword ? "Saving..." : "Update password"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
