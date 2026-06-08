import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, LayoutDashboard, TrendingUp, ShieldAlert,
  Stethoscope, Pill, FileText, Siren, ArrowLeft,
  Bell, Sun, Moon, Menu, X, MessageSquare, LogOut, Settings,
  HeartPulse,
} from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { HealthOverviewCards } from "@/components/dashboard/HealthOverviewCards";
import { HealthTrendsChart } from "@/components/dashboard/HealthTrendsChart";
import { RiskAnalysisChart } from "@/components/dashboard/RiskAnalysisChart";
import { SymptomCheckerWidget } from "@/components/dashboard/SymptomCheckerWidget";
import { MedicationLookup } from "@/components/dashboard/MedicationLookup";
import { HealthReports } from "@/components/dashboard/HealthReports";
import { EmergencySuggestions } from "@/components/dashboard/EmergencySuggestions";
import { VitalsPanel } from "@/components/dashboard/VitalsPanel";
import { useTheme } from "@/hooks/use-theme";

const NAV_ITEMS = [
  { id: "overview",   label: "Overview",        icon: LayoutDashboard },
  { id: "trends",     label: "Health Trends",   icon: TrendingUp       },
  { id: "vitals",     label: "Vital Signs",     icon: HeartPulse       },
  { id: "risk",       label: "Risk Analysis",   icon: ShieldAlert      },
  { id: "symptoms",   label: "Symptom Checker", icon: Stethoscope      },
  { id: "medications",label: "Medications",     icon: Pill             },
  { id: "reports",    label: "AI Reports",      icon: FileText         },
  { id: "emergency",  label: "Emergency Guide", icon: Siren            },
];

const sectionRefs: Record<string, string> = {
  overview:    "#overview",
  trends:      "#trends",
  vitals:      "#vitals",
  risk:        "#risk",
  symptoms:    "#symptom-checker",
  medications: "#medications",
  reports:     "#reports",
  emergency:   "#emergency",
};

function DashUserNav() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials =
    user?.firstName?.[0]?.toUpperCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ??
    "U";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        className="flex items-center gap-1.5 px-1.5 py-1 rounded-xl hover:bg-white/5 transition-colors"
      >
        {user?.imageUrl ? (
          <img
            src={user.imageUrl}
            alt=""
            className="w-7 h-7 rounded-full object-cover ring-2 ring-primary/30"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-semibold">
            {initials}
          </div>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-card border border-white/8 shadow-[0_16px_48px_rgba(0,0,0,0.4)] overflow-hidden z-[100]"
          >
            <div className="px-3 py-2.5 border-b border-white/5">
              <p className="text-xs font-semibold text-foreground truncate">
                {user?.fullName ??
                  user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ??
                  "Account"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {user?.emailAddresses?.[0]?.emailAddress}
              </p>
            </div>
            <div className="py-1">
              <Link
                href="/chat"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/4 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat
              </Link>
            </div>
            <div className="border-t border-white/5 py-1">
              <button
                onClick={() => signOut({ redirectUrl: "/" })}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/8 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const mainRef = useRef<HTMLDivElement>(null);

  const scrollTo = (id: string) => {
    setActiveSection(id);
    setMobileNavOpen(false);
    const selector = sectionRefs[id];
    const el = document.querySelector(selector);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }}
            className="hidden md:flex flex-col flex-shrink-0 bg-card border-r border-white/5 overflow-hidden"
          >
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-5 h-[60px] border-b border-white/5 flex-shrink-0">
              <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
                <Activity className="w-4 h-4" />
              </div>
              <span className="font-bold text-base tracking-tight text-foreground">MedAI</span>
              <span className="ml-auto text-[10px] text-primary/60 bg-primary/8 border border-primary/15 px-1.5 py-0.5 rounded-md font-medium">v2.0</span>
            </div>

            {/* User profile */}
            <div className="px-4 py-4 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-background/40 border border-white/5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  JD
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">John Doe</p>
                  <p className="text-[10px] text-muted-foreground/50 truncate">Patient ID #48291</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-3 overflow-y-auto">
              <p className="px-2 text-[10px] font-semibold text-muted-foreground/30 uppercase tracking-widest mb-2">Dashboard</p>
              <ul className="space-y-0.5">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => scrollTo(item.id)}
                        data-testid={`nav-${item.id}`}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                          isActive
                            ? "bg-primary/12 border border-primary/20 text-primary"
                            : "text-muted-foreground hover:bg-white/4 hover:text-foreground"
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? "text-primary" : "text-muted-foreground/50"}`} />
                        {item.label}
                        {item.id === "emergency" && (
                          <span className="ml-auto w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 pt-3 border-t border-white/5">
                <p className="px-2 text-[10px] font-semibold text-muted-foreground/30 uppercase tracking-widest mb-2">Actions</p>
                <Link href="/chat">
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-cyan-400 bg-cyan-500/8 border border-cyan-500/15 hover:bg-cyan-500/12 transition-colors mb-1">
                    <Stethoscope className="w-3.5 h-3.5" />
                    Chat with MedAI
                  </button>
                </Link>
              </div>
            </nav>

            {/* Footer */}
            <div className="p-3 border-t border-white/5 flex-shrink-0 space-y-0.5">
              <Link href="/" className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-all">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to website
              </Link>
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-all">
                <Settings className="w-3.5 h-3.5" />
                Settings
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 h-[60px] border-b border-white/5 flex items-center justify-between px-4 sm:px-6 bg-background/80 backdrop-blur-md z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              data-testid="button-toggle-sidebar"
              className="hidden md:flex p-1.5 rounded-xl text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition-all"
              aria-label="Toggle sidebar"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMobileNavOpen((v) => !v)}
              className="md:hidden p-1.5 rounded-xl text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition-all"
              aria-label="Open nav"
            >
              {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <div>
              <h1 className="text-sm font-semibold text-foreground">Health Dashboard</h1>
              <p className="text-[10px] text-muted-foreground/40 hidden sm:block">Last synced: just now</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition-all"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button className="relative p-2 rounded-xl text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition-all">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
            </button>
            <DashUserNav />
          </div>
        </header>

        {/* Mobile nav drawer */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="md:hidden absolute top-[60px] left-0 right-0 z-30 bg-card/95 backdrop-blur-xl border-b border-white/5 px-4 py-3"
            >
              <div className="grid grid-cols-2 gap-1.5">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => scrollTo(item.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        activeSection === item.id
                          ? "bg-primary/12 text-primary border border-primary/20"
                          : "text-muted-foreground hover:bg-white/5"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scrollable content */}
        <div ref={mainRef} className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

            {/* Overview Cards */}
            <section id="overview">
              <SectionHeader label="Overview" sub="Your health at a glance" />
              <HealthOverviewCards />
            </section>

            {/* Charts row */}
            <section id="trends" className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2">
                <HealthTrendsChart />
              </div>
              <div id="risk">
                <RiskAnalysisChart />
              </div>
            </section>

            {/* Vitals + Symptom Checker */}
            <section id="vitals" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <VitalsPanel />
              <div id="symptom-checker">
                <SymptomCheckerWidget />
              </div>
            </section>

            {/* Medications */}
            <section id="medications">
              <MedicationLookup />
            </section>

            {/* AI Reports */}
            <section id="reports">
              <HealthReports />
            </section>

            {/* Emergency */}
            <section id="emergency" className="pb-6">
              <EmergencySuggestions />
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-foreground">{label}</h2>
      <p className="text-xs text-muted-foreground/50">{sub}</p>
    </div>
  );
}
