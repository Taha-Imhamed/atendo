import { Suspense, lazy } from "react";
import { Router as WouterRouter, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const NotFound = lazy(() => import("@/pages/not-found"));
const Home = lazy(() => import("@/pages/home"));
const Login = lazy(() => import("@/pages/login"));
const ProfessorDashboard = lazy(() => import("@/pages/professor-dashboard"));
const ProfessorSession = lazy(() => import("@/pages/professor-session"));
const ProfessorStats = lazy(() => import("@/pages/professor-stats"));
const StudentScan = lazy(() => import("@/pages/student-scan"));
const ProfessorRoster = lazy(() => import("@/pages/professor-roster"));

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/staff-access" component={Login} />
      <Route path="/professor/login" component={Login} />
      <Route path="/student/login" component={Login} />
      <Route path="/professor/dashboard" component={ProfessorDashboard} />
      <Route path="/professor/roster" component={ProfessorRoster} />
      <Route path="/professor/session/:id" component={ProfessorSession} />
      <Route path="/professor/stats/:id" component={ProfessorStats} />
      <Route path="/student/scan" component={StudentScan} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter hook={useHashLocation}>
        <TooltipProvider>
          <Toaster />
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
                Loading...
              </div>
            }
          >
            <Router />
          </Suspense>
        </TooltipProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
