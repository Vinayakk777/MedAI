import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { FileText, TrendingUp, TrendingDown, Minus, ChevronRight, Download } from "lucide-react";

type ReportRecord = {
  id: string;
  title: string;
  summary: string | null;
  score: number | null;
  prevScore: number | null;
  highlights: string[] | null;
  trend: string | null;
  badge: string | null;
  reportDate: string;
};

const badgeColors: Record<string, string> = {
  Good: "text-emerald-400 bg-emerald-500/8 border-emerald-500/20",
  "Low Risk": "text-cyan-400 bg-cyan-500/8 border-cyan-500/20",
  Watch: "text-amber-400 bg-amber-500/8 border-amber-500/20",
  Attention: "text-rose-400 bg-rose-500/8 border-rose-500/20",
  Excellent: "text-emerald-400 bg-emerald-500/8 border-emerald-500/20",
};

function getBadgeColor(badge: string | null): string {
  return badgeColors[badge ?? ""] ?? "text-muted-foreground bg-white/5 border-white/8";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function HealthReports() {
  const { data, isLoading } = useQuery<ReportRecord[]>({
    queryKey: ["dashboard", "reports"],
    queryFn: () => fetch("/api/dashboard/reports").then((r) => r.json()),
  });

  const reports = data ?? [];

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        id="reports"
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
      >
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-foreground">AI Health Reports</h3>
        </div>
        <div className="animate-pulse space-y-4 mt-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-background/40 p-5">
              <div className="h-3 w-20 bg-white/5 rounded mb-3" />
              <div className="h-4 w-40 bg-white/5 rounded mb-2" />
              <div className="h-3 w-full bg-white/5 rounded" />
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      id="reports"
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-foreground">AI Health Reports</h3>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        {reports.length > 0 ? "Your health reports" : "No reports yet"}
      </p>

      {reports.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground/50">Add health metrics to generate reports</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {reports.map((report, i) => {
            const TrendIcon = report.trend === "up" ? TrendingUp : report.trend === "down" ? TrendingDown : Minus;
            const trendColor = report.trend === "up" ? "text-emerald-400" : report.trend === "down" ? "text-rose-400" : "text-muted-foreground";
            const highlights = report.highlights ?? [];
            return (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.08, duration: 0.4 }}
                whileHover={{ y: -2, transition: { duration: 0.15 } }}
                data-testid={`report-card-${report.id}`}
                className="group rounded-xl border border-white/5 bg-background/40 p-5 cursor-pointer hover:border-white/10 hover:bg-background/60 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[10px] text-muted-foreground/50 font-medium">{formatDate(report.reportDate)}</span>
                  {report.badge && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getBadgeColor(report.badge)}`}>
                      {report.badge}
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-semibold text-foreground mb-2 leading-tight">{report.title}</h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">{report.summary ?? "No summary"}</p>

                {highlights.length > 0 && (
                  <div className="space-y-1 mb-4">
                    {highlights.map((h, j) => (
                      <div key={j} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                        <div className="w-1 h-1 rounded-full bg-primary/40 flex-shrink-0" />
                        {h}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <div className={`flex items-center gap-1 text-[11px] font-medium ${trendColor}`}>
                    <TrendIcon className="w-3 h-3" />
                    <span>Score: {report.score ?? "—"}</span>
                    {report.prevScore != null && (
                      <span className="text-muted-foreground/30">(was {report.prevScore})</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
