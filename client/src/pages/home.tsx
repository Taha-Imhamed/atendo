import { Link } from "wouter";
import {
  ArrowRight,
  ChartColumn,
  Clock3,
  Download,
  LaptopMinimalCheck,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Layout from "@/components/layout";
import AppLogo from "@/components/app-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const featureCards = [
  {
    title: "Live Session Control",
    description: "Open rounds, rotate QR tokens, and watch attendance update instantly.",
    icon: ChartColumn,
    tone: "bg-[#DDF2E5]",
  },
  {
    title: "Roster Automation",
    description: "Create accounts and enroll students faster with import-ready flows.",
    icon: Users,
    tone: "bg-[#FEDEDA]",
  },
  {
    title: "Protected Scan Flow",
    description: "Use signed QR payloads, session checks, and audit-friendly attendance records.",
    icon: ShieldCheck,
    tone: "bg-[#F9DFB2]",
  },
];

const workflow = [
  {
    step: "01",
    title: "Start the class",
    description: "Professors launch a session and a fresh QR round is generated immediately.",
  },
  {
    step: "02",
    title: "Students scan once",
    description: "Students sign in, open their portal, and record attendance with the live QR code.",
  },
  {
    step: "03",
    title: "Track everything live",
    description: "Attendance, excuses, and round activity update in real time on the dashboard.",
  },
];

const stats = [
  { label: "Student-first entry", value: "1 main portal", hint: "The public home page now only shows student access." },
  { label: "Live round updates", value: "WebSok", hint: "Session data now refreshes immediately." },
  { label: "Faster onboarding", value: "Roster import", hint: "Bulk account creation is built in." },
];

export default function Home() {
  return (
    <Layout>
      <div className="space-y-8 animate-in-up">
        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
          <Card className="overflow-hidden border-border/85 bg-[color:var(--shell-panel)]/96">
            <CardContent className="p-0">
              <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10">
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em]">
                      Fresh attendance workspace
                    </Badge>
                   
                  </div>

                  <div className="space-y-4">
                    <AppLogo />
                    <h1 className="max-w-3xl text-4xl font-heading font-black leading-[0.95] sm:text-5xl lg:text-6xl">
                      A cleaner attendance system with live rounds, faster scans, and less confusion.
                    </h1>
                    <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                      Manage courses, launch sessions, scan attendance, review excuses, and keep the whole class flow in one connected workspace.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button asChild size="lg" variant="outline" className="rounded-full px-6">
                      <Link href="/student/login">
                        Enter Student Portal
                        <ScanLine className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {stats.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-border/85 bg-white/70 p-4 shadow-[0_10px_24px_color-mix(in_oklab,#c8d7cc_12%,transparent)]"
                      >
                        <p className="text-2xl font-heading font-black text-foreground">{item.value}</p>
                        <p className="mt-1 text-sm font-medium text-foreground">{item.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[28px] border border-border/85 bg-white/78 p-5 shadow-[0_18px_38px_color-mix(in_oklab,#c8d7cc_14%,transparent)]">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">Control Center</p>
                      <Badge variant="outline" className="rounded-full">
                        Active
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-2xl bg-[#DDF2E5] p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                               round is starting
                            </p>
                            <p className="mt-1 text-xl font-heading font-bold">Dont be late</p>
                          </div>
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/75">
                            <Clock3 className="h-5 w-5 text-foreground" />
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        <div className="rounded-2xl border border-border/85 bg-[#FEDEDA]/75 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            Student flow
                          </p>
                          <p className="mt-2 font-semibold">Login, scan, done.</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            The student side stays lightweight and focused on attendance.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/85 bg-[#F9DFB2]/65 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            Professor flow
                          </p>
                          <p className="mt-2 font-semibold">Manage classes in one place.</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Sessions, roster import, analytics, and excuse review stay connected.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-border/85 bg-[color:var(--shell-header)]/85 p-5">
                    <p className="text-sm font-semibold text-foreground">Built for daily use</p>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-white/75 p-3 text-center">
                        <LaptopMinimalCheck className="mx-auto h-5 w-5 text-primary" />
                        <p className="mt-2 text-xs text-muted-foreground">Dashboard</p>
                      </div>
                      <div className="rounded-2xl bg-white/75 p-3 text-center">
                        <ScanLine className="mx-auto h-5 w-5 text-primary" />
                        <p className="mt-2 text-xs text-muted-foreground">Scan</p>
                      </div>
                      <div className="rounded-2xl bg-white/75 p-3 text-center">
                        <ChartColumn className="mx-auto h-5 w-5 text-primary" />
                        <p className="mt-2 text-xs text-muted-foreground">Analytics</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card className="border-border/85 bg-white/78">
              <CardHeader className="pb-3">
                <CardTitle className="text-2xl">Quick Access</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="outline" className="w-full justify-between rounded-2xl">
                  <Link href="/student/login">
                    Open Student Portal
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Students can sign in here directly and go straight to attendance.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/85 bg-white/74">
              <CardHeader className="pb-3">
                <CardTitle className="text-2xl">Student Manual</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Download the student guide for sign-in steps, password change, attendance rules, and excuse requests.
                </p>
                <Button asChild variant="outline" className="rounded-2xl">
                  <a href="/student-manual.md" download>
                    Download Student Manual
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {featureCards.map((item) => (
            <Card key={item.title} className="border-border/85 bg-white/78">
              <CardHeader className="space-y-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.tone}`}>
                  <item.icon className="h-5 w-5 text-foreground" />
                </div>
                <CardTitle className="text-xl">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-border/85 bg-white/76">
            <CardHeader>
              <CardTitle className="text-2xl">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {workflow.map((item) => (
                <div
                  key={item.step}
                  className="flex gap-4 rounded-2xl border border-border/80 bg-[color:var(--shell-header)]/72 p-4"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-heading font-black">
                    {item.step}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/85 bg-white/78">
            <CardHeader>
              <CardTitle className="text-2xl">Attendance Rules</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-[#DDF2E5]/75 p-4">
                <p className="text-sm font-semibold">Use the right portal</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Professors manage classes and students only use the scan flow.
                </p>
              </div>
              <div className="rounded-2xl bg-[#FEDEDA]/70 p-4">
                <p className="text-sm font-semibold">Change passwords early</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Update default credentials as soon as you sign in.
                </p>
              </div>
              <div className="rounded-2xl bg-[#F9DFB2]/70 p-4">
                <p className="text-sm font-semibold">Scan active QR only</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Attendance is tied to active class rounds and signed QR data.
                </p>
              </div>
              <div className="rounded-2xl bg-[color:var(--shell-header)]/80 p-4">
                <p className="text-sm font-semibold">Submit excuses in-app</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  If you miss class, send the excuse through the platform and notify your professor.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </Layout>
  );
}
