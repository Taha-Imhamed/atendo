import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Login from "@/pages/login";
import ProfessorDashboard from "@/pages/professor-dashboard";
import ProfessorSession from "@/pages/professor-session";
import ProfessorStats from "@/pages/professor-stats";
import StudentScan from "@/pages/student-scan";
import ProfessorRoster from "@/pages/professor-roster";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
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
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
