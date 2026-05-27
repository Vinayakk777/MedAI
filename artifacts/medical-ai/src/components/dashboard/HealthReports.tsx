import { motion } from "framer-motion";
import { FileText, TrendingUp, TrendingDown, Minus, ChevronRight, Download } from "lucide-react";

const reports = [
  {
    id: "r1",
    date: "May 24, 2026",
    title: "Monthly Health Summary",
    summary: "Overall health score improved by 4 points. Blood pressure trending down. Cholesterol within target range.",
    score: 78,
    prevScore: 74,
    highlights: ["BP avg 118/76 mmHg", "Cholesterol: 182 mg/dL", "BMI stable at 24.3"],
    trend: "up",
    badge: "Good",
    badgeColor: "text-emerald-400 bg-emerald-500/8 border-emerald-500/20",
  },
  {
    id: "r2",
    date: "May 15, 2026",
    title: "Cardiovascular Risk Assessment",
    summary: "10-year ASCVD risk calculated at 4.2% — below the 7.5% intervention threshold. Continue current regimen.",
    score: 35,
    prevScore: 38,
    highlights: ["ASCVD risk: 4.2%", "LDL: 98 mg/dL", "HDL: 58 mg/dL"],
    trend: "up",
    badge: "Low Risk",
    badgeColor: "text-cyan-400 bg-cyan-500/8 border-cyan-500/20",
  },
  {
    id: "r3",
    date: "May 8, 2026",
    title: "Metabolic Panel Review",
    summary: "Fasting glucose slightly elevated at 108 mg/dL. HbA1c at 5.9% — pre-diabetic range. Dietary intervention recommended.",
    score: 62,
    prevScore: 65,
    highlights: ["Fasting glucose: 108", "HbA1c: 5.9%", "Insulin: 12 μU/mL"],
    trend: "down",
    badge: "Watch",
    badgeColor: "text-amber-400 bg-amber-500/8 border-amber-500/20",
  },
];

export function HealthReports() {
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
        <button className="text-[11px] text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5">
          All reports <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-5">AI-generated summaries from your health data</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reports.map((report, i) => {
          const TrendIcon = report.trend === "up" ? TrendingUp : report.trend === "down" ? TrendingDown : Minus;
          const trendColor = report.trend === "up" ? "text-emerald-400" : report.trend === "down" ? "text-rose-400" : "text-muted-foreground";
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
                <span className="text-[10px] text-muted-foreground/50 font-medium">{report.date}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${report.badgeColor}`}>
                  {report.badge}
                </span>
              </div>

              <h4 className="text-sm font-semibold text-foreground mb-2 leading-tight">{report.title}</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">{report.summary}</p>

              <div className="space-y-1 mb-4">
                {report.highlights.map((h, j) => (
                  <div key={j} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                    <div className="w-1 h-1 rounded-full bg-primary/40 flex-shrink-0" />
                    {h}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className={`flex items-center gap-1 text-[11px] font-medium ${trendColor}`}>
                  <TrendIcon className="w-3 h-3" />
                  <span>Score: {report.score}</span>
                  <span className="text-muted-foreground/30">(was {report.prevScore})</span>
                </div>
                <button className="text-muted-foreground/30 hover:text-muted-foreground transition-colors opacity-0 group-hover:opacity-100">
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
