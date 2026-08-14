import { lazy, Suspense } from "react";
import { Switch, Route, useRoute, Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Stethoscope, ArrowLeft, Users, Brain, FileText, Activity, Bell, ArrowRight, Download, Calendar } from "lucide-react";

const ClinicianDashboard = lazy(() => import("@/components/clinician/ClinicianDashboard").then(m => ({ default: m.ClinicianDashboard })));
const PatientMedicalRecord = lazy(() => import("@/components/clinician/PatientMedicalRecord").then(m => ({ default: m.PatientMedicalRecord })));
const ConsultationReviewPanel = lazy(() => import("@/components/clinician/ConsultationReviewPanel").then(m => ({ default: m.ConsultationReviewPanel })));
const PhysicianNoteEditor = lazy(() => import("@/components/clinician/PhysicianNoteEditor").then(m => ({ default: m.PhysicianNoteEditor })));
const CarePlanViewer = lazy(() => import("@/components/clinician/CarePlanViewer").then(m => ({ default: m.CarePlanViewer })));
const ReferralManager = lazy(() => import("@/components/clinician/ReferralManager").then(m => ({ default: m.ReferralManager })));
const AlertCenter = lazy(() => import("@/components/clinician/AlertCenter").then(m => ({ default: m.AlertCenter })));
const FHIRExportPanel = lazy(() => import("@/components/clinician/FHIRExportPanel").then(m => ({ default: m.FHIRExportPanel })));
const MedicalTimeline = lazy(() => import("@/components/clinician/MedicalTimeline").then(m => ({ default: m.MedicalTimeline })));

const NAV_ITEMS = [
  { path: "/clinician", label: "Dashboard", icon: Stethoscope },
  { path: "/clinician/patients", label: "Patients", icon: Users },
  { path: "/clinician/consultations", label: "Reviews", icon: Brain },
  { path: "/clinician/notes", label: "SOAP Notes", icon: FileText },
  { path: "/clinician/care-plans", label: "Care Plans", icon: Activity },
  { path: "/clinician/referrals", label: "Referrals", icon: ArrowRight },
  { path: "/clinician/alerts", label: "Alerts", icon: Bell },
  { path: "/clinician/timeline", label: "Timeline", icon: Calendar },
  { path: "/clinician/fhir-export", label: "FHIR Export", icon: Download },
];

function PageLoader() {
  return <div className="p-6 text-muted-foreground text-sm">Loading...</div>;
}

export default function ClinicianPortalPage() {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-56 bg-card border-r border-white/5 flex flex-col flex-shrink-0">
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/5">
          <Stethoscope className="w-5 h-5 text-cyan-400" />
          <span className="font-bold text-sm text-white">Clinician Portal</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path || (item.path !== "/clinician" && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${isActive ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20" : "text-muted-foreground hover:text-white hover:bg-white/[0.04]"}`}>
                <Icon className="w-3.5 h-3.5" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/5">
          <Link href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-white hover:bg-white/[0.04] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/clinician" component={ClinicianDashboard} />
            <Route path="/clinician/patients" component={PatientMedicalRecord} />
            <Route path="/clinician/consultations" component={ConsultationReviewPanel} />
            <Route path="/clinician/notes" component={PhysicianNoteEditor} />
            <Route path="/clinician/care-plans" component={CarePlanViewer} />
            <Route path="/clinician/referrals" component={ReferralManager} />
            <Route path="/clinician/alerts" component={AlertCenter} />
            <Route path="/clinician/timeline" component={MedicalTimeline} />
            <Route path="/clinician/fhir-export" component={FHIRExportPanel} />
            <Route>
              <div className="p-6 text-muted-foreground">Select a section from the sidebar.</div>
            </Route>
          </Switch>
        </Suspense>
      </main>
    </div>
  );
}
