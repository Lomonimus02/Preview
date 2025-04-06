import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import Schools from "@/pages/schools";
import Users from "@/pages/users";
import UserRoles from "@/pages/user-roles";
import SchedulePage from "@/pages/schedule";
import ScheduleNewPage from "@/pages/schedule-new";
import Grades from "@/pages/grades";
import Homework from "@/pages/homework";
import Messages from "@/pages/messages";
import Documents from "@/pages/documents";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Support from "./pages/support-page";
import Notifications from "./pages/notifications";
import SystemLogs from "./pages/system-logs";
import StudentClassAssignments from "./pages/student-class-assignments";
import ParentStudentConnections from "./pages/parent-student-connections";
import { ProtectedRoute } from "./lib/protected-route";
import { AuthProvider } from "./hooks/use-auth";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/schools" component={Schools} />
      <ProtectedRoute path="/users" component={Users} />
      <ProtectedRoute path="/user-roles" component={UserRoles} />
      <ProtectedRoute path="/schedule" component={SchedulePage} />
      <ProtectedRoute path="/schedule-new" component={ScheduleNewPage} />
      <ProtectedRoute path="/grades" component={Grades} />
      <ProtectedRoute path="/homework" component={Homework} />
      <ProtectedRoute path="/messages" component={Messages} />
      <ProtectedRoute path="/documents" component={Documents} />
      <ProtectedRoute path="/analytics" component={Analytics} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/support" component={Support} />
      <ProtectedRoute path="/notifications" component={Notifications} />
      <ProtectedRoute path="/system-logs" component={SystemLogs} />
      <ProtectedRoute path="/student-class-assignments" component={StudentClassAssignments} />
      <ProtectedRoute path="/parent-student-connections" component={ParentStudentConnections} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
