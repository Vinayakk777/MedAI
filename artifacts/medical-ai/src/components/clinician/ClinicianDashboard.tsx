import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, ClipboardList, AlertTriangle, Bell, Activity, FileText, Stethoscope } from "lucide-react";

export function ClinicianDashboard() {
  const { data: dashboard, isLoading } = useQuery<any>({
    queryKey: ["clinician-dashboard"],
    queryFn: () => fetch("/api/clinician/dashboard").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: profile } = useQuery<any>({
    queryKey: ["clinician-profile"],
    queryFn: () => fetch("/api/clinician/profile").then((r) => r.json()),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading clinician dashboard...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Stethoscope className="w-6 h-6 text-cyan-400" />
          <div>
            <h2 className="text-xl font-bold text-white">Clinician Portal</h2>
            {profile && <p className="text-xs text-muted-foreground">{profile.title} {profile.fullName} — {profile.specialty} ({profile.role})</p>}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={<Users className="w-5 h-5 text-blue-400" />} label="My Patients" value={dashboard?.totalPatients ?? 0} />
        <MetricCard icon={<ClipboardList className="w-5 h-5 text-amber-400" />} label="Pending Reviews" value={dashboard?.pendingConsultations ?? 0} warn />
        <MetricCard icon={<Bell className="w-5 h-5 text-rose-400" />} label="Unread Alerts" value={dashboard?.unreadAlerts ?? 0} warn />
        <MetricCard icon={<Activity className="w-5 h-5 text-emerald-400" />} label="Role" value={profile?.role ?? "—"} />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ActionCard icon={<FileText className="w-5 h-5" />} label="Pending Consultations" desc="Review AI-generated consultations" href="/clinician/consultations" color="cyan" />
        <ActionCard icon={<Users className="w-5 h-5" />} label="Patient List" desc="Search and manage patients" href="/clinician/patients" color="blue" />
        <ActionCard icon={<AlertTriangle className="w-5 h-5" />} label="Alert Center" desc="View and resolve alerts" href="/clinician/alerts" color="amber" />
        <ActionCard icon={<ClipboardList className="w-5 h-5" />} label="Care Plans" desc="Manage patient care plans" href="/clinician/care-plans" color="emerald" />
      </div>

      {/* Recent patients */}
      {dashboard?.recentPatientIds && dashboard.recentPatientIds.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Recent Patients</h3>
          <div className="space-y-2">
            {dashboard.recentPatientIds.map((pid: string) => (
              <PatientRow key={pid} patientUserId={pid} />
            ))}
          </div>
        </div>
      )}

      {/* Role-based info */}
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Stethoscope className="w-5 h-5 text-cyan-400 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="text-sm font-medium text-white">Clinical Decision Authority</p>
            <p>• AI recommendations remain advisory — all final clinical decisions are made by licensed physicians</p>
            <p>• AI-generated content is clearly distinguished from clinician-authored documentation</p>
            <p>• All modifications are versioned and immutable audit logs are maintained</p>
            {profile?.role === "admin" && <p className="text-amber-400">• Admin access: you can manage clinicians, view audit logs, and configure system settings</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string | number; warn?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white/5 border ${warn ? "border-amber-500/20" : "border-white/10"} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <div className={`text-2xl font-bold ${warn ? "text-amber-400" : "text-white"}`}>{value}</div>
    </motion.div>
  );
}

function ActionCard({ icon, label, desc, href, color }: { icon: React.ReactNode; label: string; desc: string; href: string; color: string }) {
  const colors: Record<string, string> = { cyan: "border-cyan-500/20 hover:bg-cyan-500/5", blue: "border-blue-500/20 hover:bg-blue-500/5", amber: "border-amber-500/20 hover:bg-amber-500/5", emerald: "border-emerald-500/20 hover:bg-emerald-500/5" };
  return (
    <a href={href} className={`block bg-white/5 border ${colors[color] || colors.cyan} rounded-xl p-4 transition-colors`}>
      <div className="text-cyan-400 mb-2">{icon}</div>
      <h4 className="text-sm font-medium text-white mb-0.5">{label}</h4>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </a>
  );
}

function PatientRow({ patientUserId }: { patientUserId: string }) {
  const { data: consultations } = useQuery<any[]>({
    queryKey: ["patient-consultations", patientUserId],
    queryFn: () => fetch(`/api/clinician/patients/${patientUserId}/record`).then((r) => r.json()),
    enabled: false,
  });

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-xs font-bold">
          {patientUserId.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-sm text-white font-medium">Patient {patientUserId.slice(0, 8)}</p>
          <p className="text-xs text-muted-foreground">ID: {patientUserId.slice(0, 16)}</p>
        </div>
      </div>
      <a href={`/clinician/patients/${patientUserId}`} className="text-xs text-cyan-400 hover:text-cyan-300">View Record</a>
    </div>
  );
}
