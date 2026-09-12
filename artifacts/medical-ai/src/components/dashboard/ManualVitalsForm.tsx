import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface Props {
  onDone?: () => void;
}

export function ManualVitalsForm({ onDone }: Props) {
  const [heartRate, setHeartRate] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [temperature, setTemperature] = useState("");
  const [oxygenSaturation, setOxygenSaturation] = useState("");
  const [bloodGlucose, setBloodGlucose] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");
  const [painScore, setPainScore] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const queryClient = useQueryClient();

  const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };

  const saveAndAnalyze = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { source: "manual" };
      if (heartRate) body.heartRate = num(heartRate);
      if (systolic) body.systolic = num(systolic);
      if (diastolic) body.diastolic = num(diastolic);
      if (temperature) body.temperature = num(temperature);
      if (oxygenSaturation) body.oxygenSaturation = num(oxygenSaturation);
      if (bloodGlucose) body.bloodGlucose = num(bloodGlucose);
      if (weight) body.weight = num(weight);
      if (height) body.height = num(height);
      if (respiratoryRate) body.respiratoryRate = num(respiratoryRate);
      if (painScore) body.painScore = num(painScore);
      if (notes) body.notes = notes;

      const hasAny = Object.keys(body).some(k => k !== "source" && body[k] != null);
      if (!hasAny) throw new Error("Enter at least one vital sign.");

      const saveRes = await fetch("/api/dashboard/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!saveRes.ok) throw new Error("Failed to save vitals");

      const analyzeRes = await fetch("/api/dashboard/vitals/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!analyzeRes.ok) throw new Error("Analysis failed");
      return analyzeRes.json();
    },
    onSuccess: (data) => {
      setAnalysis(data);
      queryClient.invalidateQueries({ queryKey: ["dashboard", "vitals"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  const inp = "w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30";

  if (analysis) {
    const riskColors: Record<string, string> = {
      normal: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      caution: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      warning: "text-orange-400 bg-orange-500/10 border-orange-500/20",
      critical: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    };
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-[#0f1117] p-5">
        <div className={`rounded-xl border ${riskColors[analysis.riskLevel] || riskColors.normal} p-4 mb-4`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-lg font-bold capitalize ${riskColors[analysis.riskLevel]?.split(" ")[0]}`}>{analysis.riskLevel} Risk</span>
            {analysis.seekMedicalAttention && <span className="text-xs font-bold text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded-full">Seek Medical Attention</span>}
          </div>
          <p className="text-sm text-white/80">{analysis.summary}</p>
        </div>

        <div className="space-y-2 mb-4">
          <p className="text-[10px] font-semibold text-white/40 uppercase">Findings</p>
          {analysis.findings?.map((f: any, i: number) => (
            <div key={i} className="flex items-start gap-2 bg-white/5 rounded-lg px-3 py-2">
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${f.status === "normal" ? "bg-emerald-400" : f.status === "caution" ? "bg-amber-400" : f.status === "warning" ? "bg-orange-400" : "bg-rose-400"}`} />
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">{f.metric}</span>
                  <span className="text-[10px] text-white/40">{f.value}</span>
                </div>
                <p className="text-[11px] text-white/60">{f.explanation}</p>
              </div>
            </div>
          ))}
        </div>

        {analysis.recommendations?.length > 0 && (
          <div className="space-y-1 mb-4">
            <p className="text-[10px] font-semibold text-white/40 uppercase">Recommendations</p>
            {analysis.recommendations.map((r: string, i: number) => (
              <p key={i} className="text-xs text-white/60">• {r}</p>
            ))}
          </div>
        )}

        <p className="text-[9px] text-white/20 mb-3">AI analysis is not a medical diagnosis. Always consult a healthcare professional.</p>

        <div className="flex gap-2">
          <button onClick={() => { setAnalysis(null); setHeartRate(""); setSystolic(""); setDiastolic(""); setTemperature(""); setOxygenSaturation(""); setBloodGlucose(""); setWeight(""); setHeight(""); setRespiratoryRate(""); setPainScore(""); setNotes(""); }}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-500/80 hover:bg-emerald-500">
            Log More
          </button>
          {onDone && <button onClick={onDone} className="px-4 py-2 rounded-xl text-xs text-white/50 border border-white/10 hover:bg-white/5">Done</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-[#0f1117] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Log Vital Signs</h3>
        {onDone && <button onClick={onDone} className="text-white/40 hover:text-white text-lg">×</button>}
      </div>
      <p className="text-xs text-white/40 mb-4">Enter any vitals you have. AI will analyze if they are safe or risky.</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-white/50 mb-1 block">Heart Rate (bpm)</label>
          <input type="number" value={heartRate} onChange={e => setHeartRate(e.target.value)} placeholder="e.g. 72" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-white/50 mb-1 block">Systolic BP (mmHg)</label>
          <input type="number" value={systolic} onChange={e => setSystolic(e.target.value)} placeholder="e.g. 120" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-white/50 mb-1 block">Diastolic BP (mmHg)</label>
          <input type="number" value={diastolic} onChange={e => setDiastolic(e.target.value)} placeholder="e.g. 80" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-white/50 mb-1 block">Temperature (°F)</label>
          <input type="number" value={temperature} onChange={e => setTemperature(e.target.value)} placeholder="e.g. 98.6" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-white/50 mb-1 block">SpO₂ (%)</label>
          <input type="number" value={oxygenSaturation} onChange={e => setOxygenSaturation(e.target.value)} placeholder="e.g. 98" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-white/50 mb-1 block">Blood Glucose (mg/dL)</label>
          <input type="number" value={bloodGlucose} onChange={e => setBloodGlucose(e.target.value)} placeholder="e.g. 95" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-white/50 mb-1 block">Resp. Rate (/min)</label>
          <input type="number" value={respiratoryRate} onChange={e => setRespiratoryRate(e.target.value)} placeholder="e.g. 16" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-white/50 mb-1 block">Weight (lbs)</label>
          <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 154" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-white/50 mb-1 block">Height (inches)</label>
          <input type="number" value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 69" className={inp} />
        </div>
        <div>
          <label className="text-[10px] text-white/50 mb-1 block">Pain (0-10)</label>
          <input type="number" value={painScore} onChange={e => setPainScore(e.target.value)} placeholder="0-10" className={inp} />
        </div>
      </div>

      <div className="mt-3">
        <label className="text-[10px] text-white/50 mb-1 block">Notes (optional)</label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. after exercise, fasting..." className={inp} />
      </div>

      {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}

      <button
        onClick={() => saveAndAnalyze.mutate()}
        disabled={saveAndAnalyze.isPending}
        className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {saveAndAnalyze.isPending ? (
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          "Save & Analyze with AI"
        )}
      </button>
    </div>
  );
}
