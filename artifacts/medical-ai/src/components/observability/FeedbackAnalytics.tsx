import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ThumbsUp, ThumbsDown, MessageSquare, AlertTriangle, CheckCircle } from "lucide-react";

export function FeedbackAnalytics() {
  const { data: summary, isLoading } = useQuery<any>({
    queryKey: ["feedback-summary"],
    queryFn: () => fetch("/api/observability/feedback/summary").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: feedbackList } = useQuery<any[]>({
    queryKey: ["feedback-list"],
    queryFn: () => fetch("/api/observability/feedback?limit=50").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading feedback...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <MessageSquare className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Feedback Analytics</h2>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={<MessageSquare className="w-5 h-5" />} label="Total Feedback" value={summary?.total ?? 0} />
        <SummaryCard icon={<ThumbsUp className="w-5 h-5" />} label="Helpful" value={summary?.helpful ?? 0} color="text-emerald-400" />
        <SummaryCard icon={<ThumbsDown className="w-5 h-5" />} label="Not Helpful" value={summary?.notHelpful ?? 0} warn />
        <SummaryCard icon={<CheckCircle className="w-5 h-5" />} label="Satisfaction" value={`${summary?.satisfactionRate ?? "0"}%`} />
      </div>

      {/* Average scores */}
      {summary?.averageScores && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Average Ratings (out of 5)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <RatingBar label="Accuracy" value={summary.averageScores.accuracy} />
            <RatingBar label="Ease of Understanding" value={summary.averageScores.easeOfUnderstanding} />
            <RatingBar label="Helpfulness" value={summary.averageScores.helpfulness} />
            <RatingBar label="Trust Level" value={summary.averageScores.trustLevel} />
          </div>
        </div>
      )}

      {/* Complaint patterns */}
      {summary?.patterns && summary.patterns.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Detected Complaint Patterns
          </h3>
          <div className="space-y-2">
            {summary.patterns.map((p: any) => (
              <div key={p.pattern} className="flex items-center justify-between">
                <span className="text-sm text-white/80">{p.label}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (p.frequency / Math.max(...summary.patterns.map((x: any) => x.frequency))) * 100)}%` }}
                      className="h-full rounded-full bg-amber-500" transition={{ duration: 0.6 }} />
                  </div>
                  <span className="text-xs text-amber-400 font-medium w-8 text-right">{p.frequency}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent feedback */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Recent Feedback</h3>
        {feedbackList && feedbackList.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {feedbackList.map((fb: any) => (
              <div key={fb.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                <div className={`mt-0.5 ${fb.rating === "helpful" ? "text-emerald-400" : "text-red-400"}`}>
                  {fb.rating === "helpful" ? <ThumbsUp className="w-4 h-4" /> : <ThumbsDown className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${fb.rating === "helpful" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                      {fb.rating}
                    </span>
                    {fb.categories?.map((cat: string) => (
                      <span key={cat} className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">{cat}</span>
                    ))}
                  </div>
                  {fb.freeText && <p className="text-sm text-white/70 truncate">{fb.freeText}</p>}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>A:{fb.accuracyRating ?? "-"}</span>
                    <span>E:{fb.easeOfUnderstanding ?? "-"}</span>
                    <span>H:{fb.helpfulness ?? "-"}</span>
                    <span>T:{fb.trustLevel ?? "-"}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(fb.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No feedback yet.</p>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color, warn }: { icon: React.ReactNode; label: string; value: string | number; color?: string; warn?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white/5 border ${warn ? "border-red-500/20" : "border-white/10"} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={color || "text-cyan-400"}>{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${warn ? "text-red-400" : color || "text-white"}`}>{value}</div>
    </motion.div>
  );
}

function RatingBar({ label, value }: { label: string; value: number }) {
  const pct = ((value || 0) / 5) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span>{(value || 0).toFixed(1)}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" transition={{ duration: 0.6 }} />
      </div>
    </div>
  );
}
