import { lazy, Suspense, useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import { AnimatePresence, motion } from "framer-motion";
import { Activity } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FloatingSupportWidget } from "@/components/ui/FloatingSupportWidget";

const HomePage      = lazy(() => import("@/pages/HomePage"));
const ChatPage      = lazy(() => import("@/pages/ChatPage"));
const AboutPage     = lazy(() => import("@/pages/AboutPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const SignInPage    = lazy(() => import("@/pages/SignInPage"));
const SignUpPage    = lazy(() => import("@/pages/SignUpPage"));
const NotFound      = lazy(() => import("@/pages/not-found"));

// REQUIRED — resolves key from hostname for multi-domain / custom-domain support
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — empty in dev (intentional), auto-injected in production
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY — check Replit Secrets");
}

const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "bottom" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "hsl(183, 100%, 45%)",
    colorForeground: "hsl(210, 40%, 96%)",
    colorMutedForeground: "hsl(215, 20%, 65%)",
    colorBackground: "hsl(222, 47%, 9%)",
    colorInput: "hsl(222, 47%, 12%)",
    colorInputForeground: "hsl(210, 40%, 96%)",
    colorNeutral: "hsl(215, 30%, 18%)",
    colorDanger: "hsl(0, 72%, 51%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[hsl(222,47%,9%)] border border-white/8 rounded-2xl w-[440px] max-w-full overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.5)]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white font-bold text-xl",
    headerSubtitle: "text-slate-400 text-sm",
    socialButtonsBlockButtonText: "text-white text-sm",
    formFieldLabel: "text-slate-300 text-sm font-medium",
    footerActionLink: "text-cyan-400 hover:text-cyan-300 font-medium",
    footerActionText: "text-slate-400",
    dividerText: "text-slate-500 text-sm",
    identityPreviewEditButton: "text-cyan-400",
    formFieldSuccessText: "text-emerald-400 text-sm",
    alertText: "text-white text-sm",
    logoBox: "flex items-center justify-center py-1",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton:
      "border border-white/10 bg-white/5 hover:bg-white/8 transition-colors",
    formButtonPrimary:
      "bg-[hsl(183,100%,45%)] hover:bg-[hsl(183,100%,38%)] text-slate-900 font-semibold shadow-[0_0_20px_rgba(0,184,217,0.3)]",
    formFieldInput:
      "bg-[hsl(222,47%,12%)] border-white/10 text-white focus:border-[hsl(183,100%,45%)]/50",
    footerAction: "border-t border-white/5 bg-[hsl(222,47%,7%)] !rounded-none",
    dividerLine: "bg-white/8",
    alert: "border border-rose-500/20 bg-rose-500/10",
    otpCodeFieldInput: "bg-[hsl(222,47%,12%)] border-white/10 text-white",
    main: "px-6 py-4",
  },
};

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

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/chat" />
      </Show>
      <Show when="signed-out">
        <HomePage />
      </Show>
    </>
  );
}

function ProtectedChat() {
  return (
    <>
      <Show when="signed-in">
        <ChatPage />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ProtectedDashboard() {
  return (
    <>
      <Show when="signed-in">
        <DashboardPage />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function AnimatedRouter() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Switch key={location}>
        <Route path="/" component={HomeRedirect} />
        {/* /*? wildcard matches Clerk OAuth sub-paths — do not remove */}
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/chat" component={ProtectedChat} />
        <Route path="/dashboard" component={ProtectedDashboard} />
        <Route path="/about" component={AboutPage} />
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back to MedAI",
            subtitle: "Sign in to access your health dashboard and chat history",
          },
        },
        signUp: {
          start: {
            title: "Create your MedAI account",
            subtitle: "Get instant AI-powered health guidance, securely saved",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <AnimatedRouter />
            </Suspense>
            <FloatingSupportWidget />
          </ErrorBoundary>
        </TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
