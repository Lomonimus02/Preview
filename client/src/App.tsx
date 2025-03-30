import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import Schools from "@/pages/schools";
import Users from "@/pages/users";
import SchedulePage from "@/pages/schedule";
import Grades from "@/pages/grades";
import Homework from "@/pages/homework";
import Messages from "@/pages/messages";
import Documents from "@/pages/documents";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Support from "@/pages/support";
import { ProtectedRoute } from "./lib/protected-route";
import { AuthProvider } from "./hooks/use-auth";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/schools" component={Schools} />
      <ProtectedRoute path="/users" component={Users} />
      <ProtectedRoute path="/schedule" component={SchedulePage} />
      <ProtectedRoute path="/grades" component={Grades} />
      <ProtectedRoute path="/homework" component={Homework} />
      <ProtectedRoute path="/messages" component={Messages} />
      <ProtectedRoute path="/documents" component={Documents} />
      <ProtectedRoute path="/analytics" component={Analytics} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/support" component={Support} />
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
