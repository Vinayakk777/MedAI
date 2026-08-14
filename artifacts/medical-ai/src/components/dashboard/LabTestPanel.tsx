import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  FlaskConical, Microscope, Stethoscope, Radio, AlertTriangle,
  ChevronDown, ChevronUp, Clock, ShieldAlert, Beaker, ScanLine,
  Syringe, Heart, Activity, Brain,
} from "lucide-react";

type TestPriority = "immediate" | "soon" | "optional";
type TestCategory = "laboratory" | "imaging" | "bedside" | "specialist";

type RecommendedInvestigation = {
  testName: string;
  clinicalReason: string;
  helpsConfirmOrRuleOut: string[];
  priority: TestPriority;
  confidence: number;
  category: TestCategory;
  preparation?: string;
  turnaroundTime?: string;
};

type LabRecommendationResult = {
  recommendedTests: RecommendedInvestigation[];
  noTestsNeededReason?: string;
  clinicalDisclaimer: string;
};

type LabTestRecord = {
  conversationId: string;
  conversationTitle: string;
  tests: LabRecommendationResult | null;
  updatedAt: string;
};

const priorityConfig: Record<TestPriority, { label: string; color: string; bg: string; border: string }> = {
  immediate: {
    label: "Immediate",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/25",
  },
  soon: {
    label: "Soon",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
  },
  optional: {
    label: "Optional",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
  },
};

const categoryConfig: Record<TestCategory, { icon: typeof FlaskConical; color: string }> = {
  laboratory: { icon: Beaker, color: "text-cyan-400" },
  imaging: { icon: ScanLine, color: "text-violet-400" },
  bedside: { icon: Activity, color: "text-amber-400" },
  specialist: { icon: Stethoscope, color: "text-sky-400" },
};

export function LabTestPanel() {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const { data, isLoading, error } = useQuery<LabTestRecord[]>({
    queryKey: ["dashboard", "lab-tests"],
    queryFn: () => fetch("/api/laboratory-tests").then((r) => r.json()),
  });

  const records = data ?? [];

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        id="lab-tests"
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <FlaskConical className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Lab & Diagnostic Tests</h3>
        </div>
        <div className="space-y-2.5 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-4">
              <div className="h-4 w-48 bg-white/5 rounded mb-2" />
              <div className="h-3 w-32 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        id="lab-tests"
        className="rounded-2xl border border-rose-500/15 bg-rose-500/5 backdrop-blur-sm p-6"
      >
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-foreground">Unable to Load Lab Tests</h3>
        </div>
        <p className="text-xs text-muted-foreground">Failed to fetch lab test recommendations. Please try again later.</p>
      </motion.div>
    );
  }

  if (records.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        id="lab-tests"
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
      >
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Lab & Diagnostic Tests</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          No lab test recommendations yet. Complete a health consultation to receive suggestions.
        </p>
        <div className="rounded-xl border border-dashed border-white/8 bg-white/3 p-6 text-center">
          <Beaker className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/40">
            Lab test suggestions will appear here after an AI consultation
          </p>
        </div>
      </motion.div>
    );
  }

  const latest = records[0];
  const tests = latest.tests?.recommendedTests ?? [];
  const noTestsReason = latest.tests?.noTestsNeededReason;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      id="lab-tests"
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
    >
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Lab & Diagnostic Tests</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-1">
        {tests.length > 0
          ? "Suggested investigations based on your latest consultation"
          : "Diagnostic test assessment from your latest consultation"}
      </p>
      <p className="text-[10px] text-muted-foreground/40 mb-4">
        {latest.conversationTitle} &middot; {new Date(latest.updatedAt).toLocaleDateString()}
      </p>

      {noTestsReason ? (
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">No Additional Testing Needed</span>
          </div>
          <p className="text-xs text-muted-foreground">{noTestsReason}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence>
            {tests.map((test, i) => {
              const isExpanded = expandedCard === test.testName;
              const priCfg = priorityConfig[test.priority];
              const catCfg = categoryConfig[test.category];
              const CatIcon = catCfg.icon;

              return (
                <motion.div
                  key={test.testName}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl border border-white/5 bg-white/4 overflow-hidden cursor-pointer"
                  onClick={() => setExpandedCard(isExpanded ? null : test.testName)}
                >
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center flex-shrink-0">
                      <CatIcon className={`w-4 h-4 ${catCfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{test.testName}</span>
                        <span className={`text-[10px] font-semibold ${priCfg.color} ${priCfg.bg} ${priCfg.border} px-1.5 py-0.5 rounded-full`}>
                          {priCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/60">
                        <span className="capitalize">{test.category}</span>
                        {test.turnaroundTime && (
                          <>
                            <span>&middot;</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />{test.turnaroundTime}
                            </span>
                          </>
                        )}
                        <span>&middot;</span>
                        <span>Confidence: {test.confidence}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="hidden sm:flex items-center gap-1">
                        <div className="w-12 h-1.5 rounded-full bg-white/8 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/60 transition-all"
                            style={{ width: `${test.confidence}%` }}
                          />
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground/40" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="border-t border-white/5 px-4 py-3 space-y-2.5"
                      >
                        <div className="flex items-start gap-2 text-xs">
                          <Activity className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="text-muted-foreground/60 font-medium">Clinical Reason: </span>
                            <span className="text-muted-foreground">{test.clinicalReason}</span>
                          </div>
                        </div>

                        <div className="flex items-start gap-2 text-xs">
                          <SearchCheck className="w-3.5 h-3.5 text-cyan-400/60 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="text-muted-foreground/60 font-medium">Helps confirm or rule out: </span>
                            <span className="text-cyan-400/80">{test.helpsConfirmOrRuleOut.join(", ")}</span>
                          </div>
                        </div>

                        {test.preparation && (
                          <div className="flex items-start gap-2 text-xs">
                            <Syringe className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0 mt-0.5" />
                            <div>
                              <span className="text-muted-foreground/60 font-medium">Preparation: </span>
                              <span className="text-muted-foreground">{test.preparation}</span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-white/5">
        <button
          onClick={() => setShowDisclaimer(!showDisclaimer)}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
        >
          <AlertTriangle className="w-3 h-3" />
          Medical disclaimer
          {showDisclaimer ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
        </button>
        <AnimatePresence>
          {showDisclaimer && (
            <motion.p
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[10px] text-muted-foreground/30 leading-relaxed mt-2 overflow-hidden"
            >
              {latest.tests?.clinicalDisclaimer ?? "These test recommendations are generated by AI and are for informational and educational purposes only. They are NOT a substitute for professional medical advice, diagnosis, or treatment. Only a qualified healthcare professional can determine which diagnostic investigations are medically necessary based on a complete clinical evaluation. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition or test results."}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function SearchCheck(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
      <path d="m8 11 2 2 4-4" />
    </svg>
  );
}
