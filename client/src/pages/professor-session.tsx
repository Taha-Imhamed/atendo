import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, ShieldCheck, XCircle, RefreshCcw, PauseCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Layout from "@/components/layout";
import QRCodeGenerator from "@/components/qr-generator";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";

type SessionDetailResponse = {
  session: {
    id: string;
    group_id: string;
    course_id: string;
    starts_at: string;
    is_active: boolean;
  };
  course: { id: string; name: string; code: string; term: string } | null;
  group: { id: string; name: string; meeting_schedule?: string | null } | null;
  activeRound: {
    id: string;
    roundNumber: number;
    startsAt: string;
    endsAt: string | null;
    isActive: boolean;
    attendanceCount: number;
  } | null;
  qr: {
    token: string;
    expiresAt: string;
    qrPayload: string;
    roundId: string;
  } | null;
  totals: {
    attendanceCount: number;
  };
};

type SessionStatsResponse = {
  students: Array<{
    studentId: string;
    username: string;
    displayName: string;
    attendanceCount: number;
  }>;
  rounds: Array<{
    roundId: string;
    roundNumber: number;
    startsAt: string;
    endsAt: string | null;
    isActive: boolean;
    attendanceCount: number;
  }>;
  course: { id: string; name: string; code: string; term: string } | null;
  group: { id: string; name: string } | null;
  totals: {
    totalRounds: number;
    totalStudents: number;
    totalAttendance: number;
  };
};

type ExcuseListResponse = {
  excuses: Array<{
    id: string;
    status: string;
    category: string;
    reason: string;
    attachmentPath: string | null;
    roundId: string;
    roundNumber: number;
    student: {
      id: string;
      username: string;
      displayName: string;
    };
    createdAt: string;
    reviewedAt?: string | null;
  }>;
};

export default function ProfessorSession() {
  const { id: sessionId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: user } = useCurrentUser();
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [activeRoundNumber, setActiveRoundNumber] = useState<number | null>(null);
  const [attendees, setAttendees] = useState<number>(0);
  const [endingSession, setEndingSession] = useState(false);
  const [startingRound, setStartingRound] = useState(false);
  const [closingRound, setClosingRound] = useState(false);
  const [isBreakRound, setIsBreakRound] = useState(false);

  useEffect(() => {
    if (user === null) {
      setLocation("/professor/login");
      return;
    }
    if (user && user.role !== "professor") {
      setLocation("/professor/login");
    }
  }, [user, setLocation]);

  const sessionDetailQuery = useQuery<SessionDetailResponse>({
    queryKey: ["professor", "session", sessionId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/professor/sessions/${sessionId}`);
      return res.json();
    },
    enabled: Boolean(sessionId),
    staleTime: Infinity,
  });

  const statsQuery = useQuery<SessionStatsResponse>({
    queryKey: ["professor", "session", sessionId, "stats"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/professor/sessions/${sessionId}/stats`,
      );
      return res.json();
    },
    enabled: Boolean(sessionId),
    refetchInterval: 5000,
  });

  const excusesQuery = useQuery<ExcuseListResponse>({
    queryKey: ["professor", "session", sessionId, "excuses"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/professor/sessions/${sessionId}/excuses`,
      );
      return res.json();
    },
    enabled: Boolean(sessionId),
    refetchInterval: 10000,
  });

  useEffect(() => {
    const detail = sessionDetailQuery.data;
    if (!detail) return;

    if (detail.qr) {
      setQrPayload(
        detail.qr.qrPayload ??
          JSON.stringify({
            roundId: detail.qr.roundId,
            token: detail.qr.token,
            sessionId,
          }),
      );
      setExpiresAt(detail.qr.expiresAt ?? null);
      setActiveRoundId(detail.qr.roundId);
    } else {
      setQrPayload(null);
      setExpiresAt(null);
      setActiveRoundId(null);
    }

    if (detail.activeRound) {
      setActiveRoundNumber(detail.activeRound.roundNumber);
      setAttendees(detail.activeRound.attendanceCount ?? 0);
    } else {
      setActiveRoundNumber(null);
      setAttendees(0);
    }
  }, [sessionDetailQuery.data, sessionId]);

  useEffect(() => {
    if (!statsQuery.data || !activeRoundId) return;
    const activeRound = statsQuery.data.rounds.find(
      (round) => round.roundId === activeRoundId,
    );
    if (activeRound) {
      setAttendees(activeRound.attendanceCount);
      setActiveRoundNumber(activeRound.roundNumber);
    }
  }, [statsQuery.data, activeRoundId]);

  useEffect(() => {
    if (!sessionId) return;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${protocol}://${window.location.host}/?sessionId=${sessionId}`,
    );
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.event === "round:qr-updated") {
          const payload = message.payload;
          setQrPayload(
            payload.qrPayload ??
              JSON.stringify({
                roundId: payload.roundId,
                token: payload.token,
                sessionId,
              }),
          );
          setExpiresAt(payload.expiresAt ?? null);
          setActiveRoundId(payload.roundId);
        } else if (message.event === "round:started") {
          setActiveRoundNumber(message.payload.roundNumber);
          setActiveRoundId(message.payload.roundId);
          setAttendees(0);
        } else if (message.event === "session:ended") {
          toast({
            title: "Session ended",
            description: "This session was closed.",
          });
          setLocation("/professor/dashboard");
        }
      } catch (error) {
        console.error("ws message error", error);
      }
    };
    return () => ws.close();
  }, [sessionId, toast, setLocation]);

  const handleNewRound = async () => {
    if (!sessionId) return;
    setStartingRound(true);
    try {
      const res = await apiRequest("POST", `/api/professor/sessions/${sessionId}/rounds`, {
        isBreakRound,
      });
      const data = await res.json();
      if (data.qr) {
        setQrPayload(
          data.qr.qrPayload ??
            JSON.stringify({
              roundId: data.qr.roundId,
              token: data.qr.token,
              sessionId,
            }),
        );
        setExpiresAt(data.qr.expiresAt ?? null);
        setActiveRoundId(data.qr.roundId);
      }
      setActiveRoundNumber(
        data.round.round_number ?? data.round.roundNumber ?? null,
      );
      setAttendees(0);
      statsQuery.refetch();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not start round",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setStartingRound(false);
      setIsBreakRound(false);
    }
  };

  const handleCloseRound = async () => {
    if (!sessionId || !activeRoundId) return;
    setClosingRound(true);
    try {
      await apiRequest(
        "PATCH",
        `/api/professor/sessions/${sessionId}/rounds/${activeRoundId}/end`,
      );
      toast({
        title: "Round closed",
        description: "Students can no longer scan this round.",
      });
      await Promise.all([statsQuery.refetch(), sessionDetailQuery.refetch()]);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not close round",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setClosingRound(false);
    }
  };

  const handleEndSession = async () => {
    if (!sessionId) return;
    setEndingSession(true);
    try {
      await apiRequest("PATCH", `/api/professor/sessions/${sessionId}/end`);
      toast({
        title: "Session ended",
        description: "Attendance is now closed.",
      });
      setLocation("/professor/dashboard");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not end session",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setEndingSession(false);
    }
  };

  const handleExcuseDecision = async (
    excuseId: string,
    decision: "approve" | "reject",
  ) => {
    try {
      await apiRequest(
        "PATCH",
        `/api/professor/excuses/${excuseId}/${decision}`,
      );
      toast({
        title: decision === "approve" ? "Excuse approved" : "Excuse rejected",
      });
      excusesQuery.refetch();
      statsQuery.refetch();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const stats = statsQuery.data;
  const topStudents = useMemo(() => {
    if (!stats?.students) return [];
    return [...stats.students]
      .sort((a, b) => b.attendanceCount - a.attendanceCount)
      .slice(0, 3);
  }, [stats?.students]);

  if (sessionDetailQuery.isLoading) {
    return (
      <Layout role="professor">
        <div className="max-w-5xl mx-auto space-y-4 animate-in-up">
          <p className="text-muted-foreground">Loading session…</p>
        </div>
      </Layout>
    );
  }

  if (!sessionDetailQuery.data) {
    return (
      <Layout role="professor">
        <div className="max-w-5xl mx-auto space-y-4 animate-in-up">
          <p className="text-muted-foreground">Session not found.</p>
        </div>
      </Layout>
    );
  }

  const detail = sessionDetailQuery.data;
  const totalStudents = stats?.students?.length ?? 0;

  return (
    <Layout role="professor">
      <div className="max-w-5xl mx-auto space-y-8 animate-in-up">
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
                {detail.course?.name ?? "Session"}
              </h1>
              <p className="text-muted-foreground flex items-center gap-2 flex-wrap">
                {detail.course && (
                  <span className="font-mono bg-secondary px-2 py-0.5 rounded text-xs">
                    {detail.course.code}
                  </span>
                )}
                <span>•</span>
                <span>{detail.group?.name ?? "Group"}</span>
                {!detail.session.is_active && (
                  <>
                    <span>•</span>
                    <span className="text-red-500 font-semibold">Ended</span>
                  </>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2 flex-wrap justify-end">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isBreakRound}
                onChange={(e) => setIsBreakRound(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Break round (10m threshold)
            </label>
            <Button 
              variant="secondary" 
              onClick={handleNewRound}
              disabled={startingRound || !detail.session.is_active}
              className="shadow-lg shadow-primary/10"
            >
              {startingRound ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCcw className="w-4 h-4 mr-2" aria-hidden="true" />
              )}
              {startingRound ? "Starting…" : "New Round"}
            </Button>
            <Button
              variant="outline"
              onClick={handleCloseRound}
              disabled={
                closingRound || !detail.session.is_active || !activeRoundId
              }
              className="shadow-md shadow-primary/5"
            >
              {closingRound ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <PauseCircle className="w-4 h-4 mr-2" aria-hidden="true" />
              )}
              {closingRound ? "Closing…" : "Close Round"}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleEndSession}
              className="shadow-lg shadow-destructive/20"
              disabled={endingSession || !detail.session.is_active}
            >
              <XCircle className="w-4 h-4 mr-2" />{" "}
              {endingSession ? "Ending…" : "End Session"}
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {/* Main QR Area */}
          <div className="md:col-span-2 space-y-6">
            <Card className="p-5 sm:p-8 border-border shadow-2xl shadow-primary/5 bg-white flex flex-col items-center justify-center min-h-[360px] sm:min-h-[420px] md:min-h-[500px]">
              <div className="w-full max-w-md mx-auto">
                <QRCodeGenerator
                  payload={qrPayload}
                  expiresAt={expiresAt}
                  roundNumber={activeRoundNumber}
                />
              </div>
            </Card>
          </div>

          {/* Sidebar Stats */}
          <div className="space-y-6">
            <Card className="p-6 bg-primary text-white border-none shadow-xl">
              <h3 className="text-sm font-medium opacity-80 uppercase tracking-wider mb-2">Live Attendees</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-bold">{attendees}</span>
                <span className="opacity-60">/ {totalStudents}</span>
              </div>
              <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-500" 
                  style={{
                    width: `${
                      totalStudents
                        ? Math.min(100, (attendees / totalStudents) * 100)
                        : 0
                    }%`,
                  }} 
                />
              </div>
              <p className="text-xs opacity-80 mt-2">
                Round {activeRoundNumber ?? "—"}
              </p>
            </Card>

            <Card className="p-6 border-border">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Recent Scans
              </h3>
              <div className="space-y-4">
                {topStudents.length === 0 && (
                  <p className="text-sm text-muted-foreground">Waiting for scans…</p>
                )}
                {topStudents.map((student, i) => (
                  <div
                    key={student.studentId}
                    className="flex items-center gap-3 animate-in-up"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-primary uppercase">
                      {student.displayName.slice(0, 1)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{student.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {student.attendanceCount} check-ins
                      </p>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                  </div>
                ))}
              </div>
            </Card>
            
            <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg text-sm border border-yellow-100">
               <p className="font-semibold mb-1">Security Active</p>
               QR codes rotate after each scan and expire quickly.
            </div>

            <Card className="p-4 border border-slate-200/60">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Excuse Requests</h3>
                {excusesQuery.isFetching && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              </div>
              {excusesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading requests…</p>
              ) : excusesQuery.data?.excuses?.length ? (
                <div className="space-y-3">
                  {excusesQuery.data.excuses.slice(0, 4).map((excuse) => (
                    <div
                      key={excuse.id}
                      className="p-3 rounded-lg border border-slate-200 bg-white/60 flex flex-col gap-2"
                    >
                      <div className="flex justify-between text-sm font-medium">
                        <span>{excuse.student.displayName}</span>
                        <Badge
                          variant="outline"
                          className={
                            excuse.status === "APPROVED"
                              ? "border-green-500 text-green-600"
                              : excuse.status === "REJECTED"
                                ? "border-destructive text-destructive"
                                : "border-amber-500 text-amber-600"
                          }
                        >
                          {excuse.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Round {excuse.roundNumber}: {excuse.reason}
                      </p>
                      {excuse.status === "PENDING" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleExcuseDecision(excuse.id, "approve")}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleExcuseDecision(excuse.id, "reject")}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No requests yet.</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

