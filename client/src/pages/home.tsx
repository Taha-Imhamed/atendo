import { Link } from "wouter";
import { ArrowRight, ChartColumn, ScanLine, ShieldCheck, Users } from "lucide-react";
import Layout from "@/components/layout";
import AppLogo from "@/components/app-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const featureCards = [
  {
    title: "Live Session Control",
    description: "Start rounds, enforce geofence rules, and track attendance in real time.",
    icon: ChartColumn,
  },
  {
    title: "Roster Automation",
    description: "Upload Excel sheets to generate student accounts and enrollment quickly.",
    icon: Users,
  },
  {
    title: "Secure Scan Flow",
    description: "Tokenized QR scans with anti-replay, audit logs, and fraud signal detection.",
    icon: ShieldCheck,
  },
];

export default function Home() {
  return (
    <Layout>
      <div className="space-y-10 animate-in-up">
        <section className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-6">
            <Badge variant="secondary" className="w-fit">
              Smart Attendance Platform
            </Badge>
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-black leading-tight">
                Attendance management that professors and students can trust.
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Run classes, manage accounts, and capture attendance with cleaner workflows and strong data consistency.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/professor/login">
                  Professor Login
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/student/login">
                  Student Login
                  <ScanLine className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <AppLogo compact={false} />
              <CardTitle className="mt-3">Quick Access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-between">
                <Link href="/professor/login">
                  Open Professor Portal
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href="/student/login">
                  Open Student Portal
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                Portals are separated to reduce role confusion during sign-in.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {featureCards.map((item) => (
            <Card key={item.title} className="border-border/70 bg-card/85">
              <CardHeader className="space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </Layout>
  );
}
