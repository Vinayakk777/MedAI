import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Stethoscope, X, AlertCircle, CheckCircle, Loader2, ChevronRight,
  Pill, Clock, ShieldAlert, Heart, Thermometer, Brain, Activity,
} from "lucide-react";

const SYMPTOM_CATEGORIES = [
  {
    label: "Head & Neurological",
    color: "text-violet-400",
    bg: "bg-violet-500/8",
    border: "border-violet-500/20",
    symptoms: ["Headache", "Dizziness", "Migraine", "Brain fog", "Blurred vision"],
  },
  {
    label: "Chest & Cardiac",
    color: "text-rose-400",
    bg: "bg-rose-500/8",
    border: "border-rose-500/20",
    symptoms: ["Chest pain", "Palpitations", "Shortness of breath", "Tightness"],
  },
  {
    label: "Digestive",
    color: "text-amber-400",
    bg: "bg-amber-500/8",
    border: "border-amber-500/20",
    symptoms: ["Nausea", "Stomach pain", "Bloating", "Diarrhea", "Heartburn"],
  },
  {
    label: "General",
    color: "text-cyan-400",
    bg: "bg-cyan-500/8",
    border: "border-cyan-500/20",
    symptoms: ["Fever", "Fatigue", "Chills", "Loss of appetite", "Joint pain"],
  },
];

type AssessmentLevel = "low" | "moderate" | "high";

interface Assessment {
  level: AssessmentLevel;
  title: string;
  description: string;
  possibleCauses: string[];
  selfCare: string[];
  otcRemedies: string[];
  whenToSeekCare: string[];
  followUp: string;
}

function generateAssessment(symptoms: string[]): Assessment {
  const s = symptoms.map((x) => x.toLowerCase());
  const has = (terms: string[]) => terms.some((t) => s.includes(t));

  // ── High Risk: Cardiac / Emergency ──
  if (has(["chest pain", "shortness of breath", "tightness", "palpitations"])) {
    return {
      level: "high",
      title: "Seek Medical Attention Promptly",
      description:
        "Chest-related symptoms can indicate cardiac or respiratory issues that require professional evaluation. Do not ignore these symptoms.",
      possibleCauses: [
        "Musculoskeletal strain or costochondritis",
        "Anxiety or panic attack",
        "Acid reflux / GERD",
        "Cardiac event (requires immediate ruling out)",
        "Respiratory infection or asthma exacerbation",
      ],
      selfCare: [
        "Stop all physical activity and rest in a comfortable position",
        "If chest pain is severe, crushing, or radiates to the arm/jaw — call emergency services (911 / 108) immediately",
        "Try slow, deep breathing to manage anxiety-related symptoms",
        "Avoid lying flat if shortness of breath persists — prop yourself up with pillows",
        "Do NOT drive yourself to the hospital if symptoms are severe",
      ],
      otcRemedies: [
        "Antacids (Tums, Gelusil) if heartburn is suspected",
        "Aspirin (325mg) if a cardiac event is suspected and you are not allergic — chew it, don't swallow whole",
        "Avoid NSAIDs if you have not ruled out cardiac causes",
      ],
      whenToSeekCare: [
        "Chest pain lasting more than 5 minutes",
        "Pain radiating to left arm, jaw, or back",
        "Accompanied by sweating, nausea, or dizziness",
        "Shortness of breath that worsens when lying down",
        "Heart rate above 120 or below 50 at rest",
      ],
      followUp:
        "See a doctor within 24 hours even if symptoms improve. Request an ECG and basic blood work (CBC, Troponin, BNP).",
    };
  }

  // ── Fever + multiple symptoms → infection likely ──
  if (has(["fever"]) && has(["fatigue", "chills", "joint pain", "loss of appetite", "headache"])) {
    return {
      level: "moderate",
      title: "Likely Viral or Bacterial Infection",
      description:
        "Fever combined with fatigue and body aches strongly suggests an infection. Most viral infections resolve on their own, but monitoring is important.",
      possibleCauses: [
        "Common cold or flu (influenza)",
        "COVID-19 infection",
        "Dengue or other viral fever (if in tropical region)",
        "Bacterial infection (throat, urinary, etc.)",
        "Early sign of autoimmune flare",
      ],
      selfCare: [
        "Rest — your body needs energy to fight the infection",
        "Drink at least 2–3 liters of water, ORS, or warm fluids daily",
        "Monitor temperature every 4–6 hours",
        "Use a lukewarm compress on the forehead if fever is uncomfortable",
        "Eat light, easily digestible meals (soup, rice, bananas)",
        "Isolate from others if you suspect a contagious illness",
      ],
      otcRemedies: [
        "Paracetamol (Acetaminophen) 500–1000mg every 6–8 hours for fever and body aches",
        "Ibuprofen 400mg every 8 hours for inflammation and pain (take with food)",
        "ORS sachets to prevent dehydration from fever",
        "Throat lozenges if sore throat is present",
      ],
      whenToSeekCare: [
        "Fever above 103°F (39.4°C) that doesn't respond to medication",
        "Fever lasting more than 3 days",
        "Difficulty breathing or persistent cough",
        "Severe headache with stiff neck",
        "Rash, unusual bleeding, or confusion",
        "Symptoms improving then suddenly worsening",
      ],
      followUp:
        "If no improvement in 48–72 hours, see a doctor. Get a CBC and CRP blood test to check for bacterial infection.",
    };
  }

  // ── Headache-focused ──
  if (has(["headache", "migraine", "blurred vision", "dizziness"])) {
    return {
      level: "moderate",
      title: "Headache / Neurological Symptoms",
      description:
        "Headaches with visual changes or dizziness can have many causes ranging from tension to something that needs evaluation.",
      possibleCauses: [
        "Tension headache (most common)",
        "Migraine with aura",
        "Dehydration or low blood sugar",
        "Eye strain from screen time",
        "Hypertension (high blood pressure)",
        "Sinusitis",
      ],
      selfCare: [
        "Rest in a dark, quiet room for 30–60 minutes",
        "Apply a cold compress to your forehead or the back of your neck",
        "Drink a large glass of water — dehydration is a common trigger",
        "Eat a light snack if you haven't eaten in a while",
        "Limit screen time and take 20-20-20 breaks (every 20 min, look 20 feet away for 20 sec)",
        "Gently massage your temples and neck muscles",
      ],
      otcRemedies: [
        "Paracetamol 500–1000mg (first-line for most headaches)",
        "Ibuprofen 400mg if paracetamol is insufficient",
        "For migraines: Ibuprofen works better if taken at the first sign",
        "Caffeine (coffee/tea) can help — it constricts blood vessels and boosts pain relief",
      ],
      whenToSeekCare: [
        '"Worst headache of your life" — sudden and severe',
        "Headache with fever, stiff neck, confusion, or seizures",
        "Blurred vision that doesn't resolve",
        "Headache after a head injury",
        "Headache that worsens over days despite medication",
        "New headache pattern after age 50",
      ],
      followUp:
        "If headaches are recurring (more than 2 per week), see a neurologist. Keep a headache diary noting triggers, duration, and severity.",
    };
  }

  // ── Digestive ──
  if (has(["nausea", "stomach pain", "bloating", "diarrhea", "heartburn"])) {
    return {
      level: "low",
      title: "Digestive Discomfort",
      description:
        "Your symptoms suggest a gastrointestinal issue, most commonly related to diet, stress, or a mild infection. Usually self-limiting.",
      possibleCauses: [
        "Food intolerance or indigestion",
        "Viral gastroenteritis (stomach bug)",
        "GERD / acid reflux",
        "Irritable bowel syndrome (IBS)",
        "Stress-related gut issues",
        "Food poisoning",
      ],
      selfCare: [
        "Follow the BRAT diet: Bananas, Rice, Applesauce, Toast",
        "Eat small, frequent meals instead of large ones",
        "Avoid spicy, fatty, fried, and acidic foods until symptoms resolve",
        "Stay hydrated — sip water, clear broths, or coconut water",
        "Avoid lying down immediately after eating — wait at least 2 hours",
        "Manage stress — try deep breathing or light walking",
      ],
      otcRemedies: [
        "Omeprazole 20mg or Pantoprazole 40mg for heartburn/acid reflux",
        "Antacids (Tums, Eno) for immediate relief of heartburn",
        "Loperamide (Imodium) for diarrhea — but avoid if you have fever or blood in stool",
        "ORS or electrolyte solutions to prevent dehydration from diarrhea",
        "Simethicone (Gas-X) for bloating and gas",
      ],
      whenToSeekCare: [
        "Blood in stool or vomit",
        "Severe abdominal pain that doesn't improve",
        "Diarrhea lasting more than 3 days",
        "Signs of dehydration: dark urine, dry mouth, dizziness",
        "Fever above 101°F with digestive symptoms",
        "Inability to keep any fluids down for 12+ hours",
      ],
      followUp:
        "Most digestive issues resolve in 1–3 days. If symptoms persist beyond 5 days or recur frequently, see a gastroenterologist.",
    };
  }

  // ── Fatigue-focused ──
  if (has(["fatigue", "brain fog", "loss of appetite"])) {
    return {
      level: "low",
      title: "Fatigue & Low Energy",
      description:
        "Persistent fatigue can stem from poor sleep, stress, nutritional deficiencies, or an underlying condition. It's worth investigating if it lasts more than 2 weeks.",
      possibleCauses: [
        "Sleep deprivation or poor sleep quality",
        "Iron deficiency anemia",
        "Vitamin D or B12 deficiency",
        "Hypothyroidism",
        "Depression or chronic stress",
        "Post-viral fatigue",
      ],
      selfCare: [
        "Aim for 7–9 hours of sleep per night — maintain a consistent schedule",
        "Exercise moderately for 20–30 minutes daily (walking counts)",
        "Eat nutrient-dense meals: leafy greens, eggs, nuts, whole grains",
        "Reduce caffeine after 2 PM",
        "Take short outdoor walks — sunlight boosts energy and mood",
        "Limit alcohol and avoid heavy meals before bed",
      ],
      otcRemedies: [
        "Vitamin D3 1000–2000 IU daily (most people are deficient)",
        "Iron supplement (ferrous sulfate) if anemia is suspected — take with vitamin C for absorption",
        "B-complex vitamin supplement",
        "Magnesium glycinate 200–400mg at bedtime for sleep and energy",
      ],
      whenToSeekCare: [
        "Fatigue lasting more than 2 weeks without improvement",
        "Unexplained weight loss or gain",
        "Hair loss, cold intolerance, or constipation (thyroid)",
        "Mood changes, hopelessness, or loss of interest in activities",
        "Fatigue so severe it interferes with daily activities",
      ],
      followUp:
        "Get basic blood work: CBC, Vitamin D, B12, Iron studies, TSH (thyroid). Results guide targeted treatment.",
    };
  }

  // ── Default / mild ──
  if (symptoms.length >= 3) {
    return {
      level: "moderate",
      title: "Multiple Symptoms — Monitor Closely",
      description:
        "Having several symptoms together may indicate an evolving condition. While most are not emergencies, the combination warrants attention.",
      possibleCauses: [
        "Viral infection in early stages",
        "Allergic reaction",
        "Stress or anxiety manifesting physically",
        "Dehydration",
        "Medication side effects",
      ],
      selfCare: [
        "Rest and reduce physical activity today",
        "Drink at least 2 liters of water throughout the day",
        "Keep a symptom journal — note timing, severity, and triggers",
        "Get adequate sleep tonight (8+ hours)",
        "Avoid alcohol and limit caffeine",
        "Check your temperature regularly",
      ],
      otcRemedies: [
        "Paracetamol for any pain or fever",
        "Antihistamine (Cetirizine) if allergies might be involved",
        "ORS sachets to stay hydrated",
      ],
      whenToSeekCare: [
        "Any symptom becomes severe or suddenly worsens",
        "New symptoms appear (rash, difficulty breathing, chest pain)",
        "No improvement after 48 hours",
        "Fever develops",
      ],
      followUp:
        "If symptoms don't improve in 2 days, schedule a doctor visit. If any single symptom becomes severe, seek care immediately.",
    };
  }

  // ── Low risk (1-2 mild symptoms) ──
  return {
    level: "low",
    title: "Mild Symptoms — Self-Care Recommended",
    description:
      "Your symptoms are generally mild and can likely be managed at home. Monitor for any changes.",
    possibleCauses: [
      "Mild viral infection",
      "Lifestyle factors (sleep, diet, stress)",
      "Early sign of a cold",
      "Allergies",
    ],
    selfCare: [
      "Rest today — skip intense exercise",
      "Drink plenty of water and warm fluids",
      "Eat a balanced meal even if appetite is low",
      "Take a warm shower to ease body aches",
      "Practice relaxation techniques if stressed",
    ],
    otcRemedies: [
      "Paracetamol if you have pain or fever",
      "Warm liquids (ginger tea, broth) for comfort",
    ],
    whenToSeekCare: [
      "Symptoms persist beyond 3 days",
      "Symptoms worsen instead of improving",
      "New symptoms develop",
    ],
    followUp:
      "Self-monitor for 48 hours. Most mild symptoms resolve on their own. If not, consult a doctor.",
  };
}

const levelStyles: Record<AssessmentLevel, { bg: string; border: string; icon: string; color: string }> = {
  low:      { bg: "bg-emerald-500/8",  border: "border-emerald-500/20", icon: "text-emerald-400", color: "text-emerald-400" },
  moderate: { bg: "bg-amber-500/8",    border: "border-amber-500/20",   icon: "text-amber-400",   color: "text-amber-400"   },
  high:     { bg: "bg-rose-500/8",     border: "border-rose-500/20",    icon: "text-rose-400",    color: "text-rose-400"    },
};

export function SymptomCheckerWidget() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (data: { symptoms: string[]; assessmentLevel: string; assessmentTitle: string; assessmentDescription: string; assessmentAction: string }) =>
      fetch("/api/dashboard/symptom-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    },
  });

  const toggle = (s: string) => {
    setAssessment(null);
    setShowDetails(false);
    setSelected((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const runCheck = () => {
    if (!selected.length) return;
    setAssessment(null);
    setShowDetails(false);
    const result = generateAssessment(selected);
    saveMutation.mutate({
      symptoms: selected,
      assessmentLevel: result.level,
      assessmentTitle: result.title,
      assessmentDescription: result.description,
      assessmentAction: result.selfCare[0] ?? result.description,
    });
    setAssessment(result);
  };

  const reset = () => { setSelected([]); setAssessment(null); setShowDetails(false); };

  const levelStyle = assessment ? levelStyles[assessment.level] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 }}
      id="symptom-checker"
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Symptom Checker</h3>
        </div>
        {selected.length > 0 && (
          <button onClick={reset} className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1">
            <X className="w-3 h-3" /> Clear all
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-5">Select all symptoms you are currently experiencing</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {SYMPTOM_CATEGORIES.map((cat) => (
          <div key={cat.label} className={`rounded-xl border ${cat.border} ${cat.bg} p-4`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${cat.color}`}>{cat.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {cat.symptoms.map((s) => {
                const active = selected.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggle(s)}
                    data-testid={`symptom-${s.replace(/\s/g, "-").toLowerCase()}`}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-150 border ${
                      active
                        ? `${cat.bg} ${cat.border} ${cat.color} border-opacity-60`
                        : "border-white/5 text-muted-foreground/60 hover:text-muted-foreground hover:border-white/10"
                    }`}
                  >
                    {active && <span className="mr-1">✓</span>}
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 flex-1">
            {selected.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary text-[11px] rounded-lg font-medium">
                {s}
                <button onClick={() => toggle(s)} className="hover:text-primary/60">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <button
          onClick={runCheck}
          disabled={selected.length === 0 || saveMutation.isPending}
          data-testid="button-check-symptoms"
          className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
          Analyze
        </button>
      </div>

      <AnimatePresence>
        {assessment && levelStyle && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className={`rounded-xl border ${levelStyle.border} ${levelStyle.bg} p-4`}
          >
            <div className="flex items-start gap-3">
              {assessment.level === "low"
                ? <CheckCircle className={`w-5 h-5 ${levelStyle.icon} flex-shrink-0 mt-0.5`} />
                : <AlertCircle className={`w-5 h-5 ${levelStyle.icon} flex-shrink-0 mt-0.5`} />
              }
              <div className="flex-1">
                <p className={`text-sm font-semibold mb-1 ${levelStyle.color}`}>{assessment.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">{assessment.description}</p>

                {/* Self-Care */}
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                    <p className="text-xs font-semibold text-foreground">What You Should Do</p>
                  </div>
                  <ul className="space-y-1">
                    {assessment.selfCare.slice(0, showDetails ? undefined : 3).map((tip, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-2">
                        <span className="text-cyan-400 mt-0.5">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* OTC Remedies */}
                {showDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mb-3"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Pill className="w-3.5 h-3.5 text-violet-400" />
                      <p className="text-xs font-semibold text-foreground">Over-the-Counter Remedies</p>
                    </div>
                    <ul className="space-y-1">
                      {assessment.otcRemedies.map((remedy, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-2">
                          <span className="text-violet-400 mt-0.5">•</span>
                          {remedy}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}

                {/* Possible Causes */}
                {showDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mb-3"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Brain className="w-3.5 h-3.5 text-amber-400" />
                      <p className="text-xs font-semibold text-foreground">Possible Causes</p>
                    </div>
                    <ul className="space-y-1">
                      {assessment.possibleCauses.map((cause, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5">•</span>
                          {cause}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}

                {/* When to Seek Care */}
                {showDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mb-3"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Heart className="w-3.5 h-3.5 text-rose-400" />
                      <p className="text-xs font-semibold text-foreground">Warning Signs — Seek Care If:</p>
                    </div>
                    <ul className="space-y-1">
                      {assessment.whenToSeekCare.map((sign, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-2">
                          <span className="text-rose-400 mt-0.5">!</span>
                          {sign}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}

                {/* Follow-up */}
                {showDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mb-2"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <p className="text-xs font-semibold text-foreground">Follow-Up</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground pl-5">{assessment.followUp}</p>
                  </motion.div>
                )}

                {/* Toggle Details */}
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className={`flex items-center gap-1.5 text-xs font-medium ${levelStyle.color} mt-1 hover:underline`}
                >
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showDetails ? "rotate-90" : ""}`} />
                  {showDetails ? "Show less" : "View full analysis"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {assessment && (
        <p className="text-[10px] text-muted-foreground/40 mt-3 text-center">
          This is general health guidance, not a medical diagnosis. Always consult a healthcare professional for personalized advice.
        </p>
      )}
    </motion.div>
  );
}
