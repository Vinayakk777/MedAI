import { lazy, Suspense, useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Activity } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FloatingSupportWidget } from "@/components/ui/FloatingSupportWidget";
import { AuthProvider, useAuth } from "@/lib/supabase";

const HomePage      = lazy(() => import("@/pages/HomePage"));
const ChatPage      = lazy(() => import("@/pages/ChatPage"));
const AboutPage     = lazy(() => import("@/pages/AboutPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const SignInPage    = lazy(() => import("@/pages/SignInPage"));
const SignUpPage    = lazy(() => import("@/pages/SignUpPage"));
const NotFound      = lazy(() => import("@/pages/not-found"));
const ClinicianPortalPage = lazy(() => import("@/pages/ClinicianPortalPage"));
const DocumentsPage = lazy(() => import("@/pages/DocumentsPage"));
const RagAdminPage = lazy(() => import("@/pages/RagAdminPage"));

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      >
        <Activity className="w-6 h-6 text-primary" />
      </motion.div>
    </div>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return (
    <>
      {user ? <Redirect to="/chat" /> : <HomePage />}
    </>
  );
}

function ProtectedChat() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return (
    <>
      {user ? <ChatPage /> : <Redirect to="/sign-in" />}
    </>
  );
}

function ProtectedDashboard() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  return (
    <>
      {user ? <DashboardPage /> : <Redirect to="/sign-in" />}
    </>
  );
}

function AnimatedRouter() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Switch key={location}>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/chat" component={ProtectedChat} />
        <Route path="/dashboard" component={ProtectedDashboard} />
        <Route path="/about" component={AboutPage} />
        <Route path="/clinician/*?" component={ClinicianPortalPage} />
        <Route path="/documents" component={DocumentsPage} />
        <Route path="/rag-admin" component={RagAdminPage} />
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <AnimatedRouter />
                <FloatingSupportWidget />
              </Suspense>
            </ErrorBoundary>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </WouterRouter>
  );
}

export default App;
