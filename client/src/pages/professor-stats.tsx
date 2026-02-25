import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Filter, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import Layout from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";

type StatsResponse = {
  sessionId: string;
  course: { id: string; name: string; code: string; term: string } | null;
  group: { id: string; name: string } | null;
  rounds: Array<{
    roundId: string;
    roundNumber: number;
    startsAt: string;
    endsAt: string | null;
    isActive: boolean;
    attendanceCount: number;
  }>;
  students: Array<{
    studentId: string;
    username: string;
    displayName: string;
    attendanceCount: number;
  }>;
  totals: {
    totalRounds: number;
    totalStudents: number;
    totalAttendance: number;
  };
};

type AnalyticsResponse = {
  sessionId: string;
  students: Array<{
    studentId: string;
    username: string;
    displayName: string;
    present: number;
    late: number;
    excused: number;
    absences: number;
    attendancePercent: number;
  }>;
  rounds: Array<{
    roundId: string;
    roundNumber: number;
    present: number;
    late: number;
    excused: number;
    absent: number;
  }>;
  totals: {
    totalStudents: number;
    totalRounds: number;
  };
};

export default function ProfessorStats() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { data: user } = useCurrentUser();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [exportingPeriod, setExportingPeriod] = useState<"weekly" | "monthly" | null>(null);

  useEffect(() => {
    if (user === null) {
      setLocation("/professor/login");
      return;
    }
    if (user && user.role !== "professor") {
      setLocation("/professor/login");
    }
  }, [user, setLocation]);

  const statsQuery = useQuery<StatsResponse>({
    queryKey: ["professor", "session", id, "stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/professor/sessions/${id}/stats`);
      return res.json();
    },
    enabled: Boolean(id),
    refetchInterval: 10000,
  });

  const analyticsQuery = useQuery<AnalyticsResponse>({
    queryKey: ["professor", "session", id, "analytics"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/professor/sessions/${id}/analytics`,
      );
      return res.json();
    },
    enabled: Boolean(id),
    refetchInterval: 15000,
  });

  const handleExport = async () => {
    if (!id) return;
    setExporting(true);
    try {
      const res = await apiRequest(
        "GET",
        `/api/professor/sessions/${id}/analytics/export`,
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const courseCode = statsQuery.data?.course?.code ?? "session";
      const groupName = statsQuery.data?.group?.name ?? "group";
      link.download = `${courseCode}-${groupName}-attendance.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Export ready",
        description: "CSV download started.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setExporting(false);
    }
  };

  const handlePeriodExport = async (period: "weekly" | "monthly") => {
    setExportingPeriod(period);
    try {
      const res = await apiRequest(
        "GET",
        `/api/professor/reports/attendance/export?period=${period}`,
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendance-${period}-report.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Export ready",
        description: `${period === "weekly" ? "Weekly" : "Monthly"} report download started.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setExportingPeriod(null);
    }
  };

  if (statsQuery.isLoading) {
    return (
      <Layout role="professor">
        <div className="space-y-4 animate-in-up">
          <p className="text-muted-foreground">Loading session stats…</p>
        </div>
      </Layout>
    );
  }

  if (!statsQuery.data) {
    return (
      <Layout role="professor">
        <div className="space-y-4 animate-in-up">
          <p className="text-muted-foreground">Session not found.</p>
        </div>
      </Layout>
    );
  }

  const stats = statsQuery.data;
  const analytics = analyticsQuery.data;
  const studentAnalyticsMap = new Map(
    analytics?.students.map((s) => [s.studentId, s]),
  );
  const courseName = stats.course?.name ?? "Session";
  const chartData = (analytics?.rounds ?? stats.rounds).map((round) => {
    const isAnalytics = "present" in round;
    const present = isAnalytics ? (round as any).present : (round as any).attendanceCount;
    const late = isAnalytics ? (round as any).late : 0;
    const excused = isAnalytics ? (round as any).excused : 0;
    const absent = isAnalytics ? (round as any).absent : undefined;
    const total = isAnalytics ? present + late + excused : present;
    return {
      name: `Round ${round.roundNumber}`,
      attendance: total,
      onTime: present,
      late,
      excused,
      absent,
    };
  });
  const totalStudentsCount = stats.totals.totalStudents || stats.students.length;
  const averageAttendancePercent =
    totalStudentsCount && stats.totals.totalRounds
      ? Math.round(
          (stats.totals.totalAttendance /
            (stats.totals.totalRounds * totalStudentsCount)) *
            100,
        )
      : 0;
  const potentialScans =
    totalStudentsCount * (stats.totals.totalRounds || 1);
  const scanCoveragePercent = potentialScans
    ? Math.round(
        (stats.totals.totalAttendance / potentialScans) * 100,
      )
    : 0;

  return (
    <Layout role="professor">
      <div className="space-y-8 animate-in-up">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setLocation("/professor/dashboard")}
              className="rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-heading font-bold text-primary">
                {courseName} Analytics
              </h1>
              <p className="text-muted-foreground">
                {stats.group ? `Group ${stats.group.name}` : "Attendance overview and student performance."}
              </p>
            </div>
          </div>
          
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-4 h-4" aria-hidden="true" />
            )}
            {exporting ? "Preparing..." : "End Class Report"}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => handlePeriodExport("weekly")}
            disabled={exportingPeriod !== null}
          >
            {exportingPeriod === "weekly" ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-4 h-4" aria-hidden="true" />
            )}
            Weekly Report
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => handlePeriodExport("monthly")}
            disabled={exportingPeriod !== null}
          >
            {exportingPeriod === "monthly" ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-4 h-4" aria-hidden="true" />
            )}
            Monthly Report
          </Button>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="col-span-2 shadow-sm">
            <CardHeader>
              <CardTitle>Attendance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis 
                      dataKey="name" 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      stroke="#888888" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value) => `${value}`} 
                    />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar 
                      dataKey="attendance" 
                      fill="hsl(222 47% 31%)" 
                      radius={[4, 4, 0, 0]} 
                      barSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Average Attendance</span>
                  <span className="font-bold text-primary">{averageAttendancePercent}%</span>
                </div>
                <Progress value={averageAttendancePercent} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Check-ins Recorded</span>
                  <span className="font-bold text-accent">{scanCoveragePercent}%</span>
                </div>
                <Progress value={scanCoveragePercent} className="h-2 [&>div]:bg-accent" />
              </div>
              <div className="pt-4 border-t">
                <div className="text-3xl font-bold text-primary">
                  {totalStudentsCount}
                </div>
                <div className="text-sm text-muted-foreground">Enrolled Students</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Late vs On-time (per round)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="onTime" stackId="a" fill="hsl(221 83% 53%)" name="On time" />
                  <Bar dataKey="late" stackId="a" fill="hsl(24 95% 53%)" name="Late" />
                  <Bar dataKey="excused" stackId="a" fill="hsl(152 76% 40%)" name="Excused" />
                  <Bar dataKey="absent" stackId="a" fill="hsl(215 16% 47%)" name="Absent" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Student Table */}
        <Card className="shadow-sm border-border">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle>Student Roster</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
               <div className="relative">
                 <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                 <Input placeholder="Search students..." className="pl-9 w-full sm:w-[250px]" />
               </div>
               <Button variant="outline" size="icon" className="shrink-0"><Filter className="w-4 h-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Attendance Rate</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {stats.students.map((student) => {
                  const analyticsRow = studentAnalyticsMap.get(student.studentId);
                  const attendanceRate =
                    analyticsRow?.attendancePercent ??
                    (stats.totals.totalRounds > 0
                      ? Math.round(
                          (student.attendanceCount / stats.totals.totalRounds) * 100,
                        )
                      : 0);
                  return (
                    <TableRow key={student.studentId}>
                      <TableCell className="font-medium">{student.displayName}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{student.username}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold ${
                              attendanceRate < 80 ? "text-destructive" : "text-green-600"
                            }`}
                          >
                            {attendanceRate}%
                          </span>
                          <Progress
                            value={attendanceRate}
                            className={`h-1.5 w-20 ${
                              attendanceRate < 80
                                ? "[&>div]:bg-destructive"
                                : "[&>div]:bg-green-600"
                            }`}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {attendanceRate < 80 ? (
                          <span className="inline-flex items-center rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                            At Risk
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                            Good Standing
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}


