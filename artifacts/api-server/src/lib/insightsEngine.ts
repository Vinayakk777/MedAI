import { generateJSON } from "./aiClient";
import type { MedicalMemory } from "@workspace/db";

const INSIGHT_TIMEOUT_MS = 14_000;

interface AIInsightInput {
  symptomHistory: { name: string; severity: string; count: number; firstDate: string; lastDate: string }[];
  diagnosisHistory: { name: string; confidence: string; count: number }[];
  vitalTrends: { metric: string; recentAverage: number | null; previousAverage: number | null; direction: string }[];
  lifestyleFactors: { smoking?: string; alcohol?: string; exercise?: string };
  consultationCount: number;
  dateRange: { first: string; last: string };
  activeConditions: string[];
  allergies: string[];
  averageRiskScore: number | null;
}

const INSIGHT_PROMPT = `You are a preventive health analytics engine. Generate personalized, evidence-informed health insights based on the user's longitudinal health data.

You will receive: symptom history, diagnosis history, vital sign trends, lifestyle factors, consultation metadata, and risk assessments.

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "insights": [
    {
      "category": "symptom_trend | vital_trend | lifestyle | medication | preventive | recovery",
      "title": "Short, clear title (5-10 words)",
      "description": "Patient-friendly observation with specific data points. 2-3 sentences. Reference actual numbers and dates.",
      "confidence": "high | moderate | low",
      "relevanceScore": 0-100,
      "isActionable": true/false,
      "suggestedAction": "Optional actionable suggestion if applicable",
      "relatedSymptoms": ["symptom 1", "symptom 2"],
      "relatedMetrics": ["metric 1"]
    }
  ]
}

## Rules:
1. NEVER diagnose. Use phrases like "may indicate", "could suggest", "is associated with", "raises consideration for".
2. Always reference specific data points from the user's records.
3. Distinguish between improving, stable, and worsening trends.
4. For actionable insights, provide specific, measurable suggestions.
5. Maximum 6 insights per generation. Prioritize the most clinically relevant ones.
6. Include at least 1 positive/improving insight if the data supports it.
7. Confidence levels: "high" when multiple data points confirm a clear trend, "moderate" when data suggests but doesn't confirm, "low" when based on limited data.
8. Never fabricate data. If data is insufficient, note that in the description.

## Example insights:
- "Your respiratory symptoms have decreased from 4 episodes per month to 1 over the last 3 months, suggesting improvement."
- "Blood pressure readings have averaged 138/88 over your last 5 recordings, which is above the normal range of 120/80. Consider discussing this with your physician."
- "You have consulted for headaches 6 times in the past year. This recurring pattern may benefit from a thorough evaluation."
- "Your sleep has improved by 1 hour on average since your last consultation, which positively impacts recovery and immune function."
- "Based on your symptom patterns, spring months show increased allergy-type complaints. Preventive antihistamine use may be worth discussing."`;

export async function generateAIInsights(
  memories: MedicalMemory[],
): Promise<{ insights: AIInsight[] } | null> {
  if (memories.length === 0) return null;

  const input = buildInsightInput(memories);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INSIGHT_TIMEOUT_MS);

  try {
    const result = await generateJSON<{ insights: AIInsight[] }>({
      systemPrompt: INSIGHT_PROMPT,
      userContent: JSON.stringify(input, null, 2),
      temperature: 0.3,
      maxTokens: 2048,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[insightsEngine] generation failed:", message);
    return null;
  }
}

export interface AIInsight {
  category: string;
  title: string;
  description: string;
  confidence: string;
  relevanceScore: number;
  isActionable: boolean;
  suggestedAction?: string;
  relatedSymptoms?: string[];
  relatedMetrics?: string[];
}

function toNameKey(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object" && "name" in (value as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown>).name;
    if (typeof inner === "string") return inner.toLowerCase();
  }
  if (value != null) return String(value).toLowerCase();
  return "";
}

function buildInsightInput(memories: MedicalMemory[]): AIInsightInput {
  const symptomMap = new Map<string, { severity: string; count: number; first: Date; last: Date }>();
  const diagnosisMap = new Map<string, { confidence: string; count: number }>();
  let minDate = new Date();
  let maxDate = new Date(0);

  for (const m of memories) {
    const date = new Date(m.consultationDate);
    if (date < minDate) minDate = date;
    if (date > maxDate) maxDate = date;

    if (m.symptoms) {
      for (const s of m.symptoms) {
        const key = toNameKey(s.name);
        const existing = symptomMap.get(key);
        if (existing) {
          existing.count++;
          if (date < existing.first) existing.first = date;
          if (date > existing.last) existing.last = date;
        } else {
          symptomMap.set(key, { severity: s.severity, count: 1, first: date, last: date });
        }
      }
    }

    if (m.diagnoses) {
      for (const d of m.diagnoses) {
        const key = toNameKey(d.name);
        const existing = diagnosisMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          diagnosisMap.set(key, { confidence: d.confidence, count: 1 });
        }
      }
    }
  }

  const symptomHistory = Array.from(symptomMap.entries())
    .map(([name, info]) => ({
      name,
      severity: info.severity,
      count: info.count,
      firstDate: info.first.toISOString(),
      lastDate: info.last.toISOString(),
    }))
    .sort((a, b) => b.count - a.count);

  const diagnosisHistory = Array.from(diagnosisMap.entries())
    .map(([name, info]) => ({ name, confidence: info.confidence, count: info.count }))
    .sort((a, b) => b.count - a.count);

  const vitalTrends = computeVitalTrends(memories);

  const latestLifestyle = memories
    .filter((m) => m.lifestyleFactors && (m.lifestyleFactors.smoking || m.lifestyleFactors.alcohol || m.lifestyleFactors.exercise))
    .pop()?.lifestyleFactors ?? {};

  const activeConditions = [...new Set(memories.flatMap((m) => m.chronicConditions ?? []))];
  const allergies = [...new Set(memories.flatMap((m) => m.allergies ?? []))];
  const riskScores = memories.map((m) => m.riskScore).filter((s): s is number => s != null);
  const averageRiskScore = riskScores.length > 0 ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length) : null;

  return {
    symptomHistory,
    diagnosisHistory,
    vitalTrends,
    lifestyleFactors: latestLifestyle,
    consultationCount: memories.length,
    dateRange: { first: minDate.toISOString(), last: maxDate.toISOString() },
    activeConditions,
    allergies,
    averageRiskScore,
  };
}

function computeVitalTrends(memories: MedicalMemory[]): { metric: string; recentAverage: number | null; previousAverage: number | null; direction: string }[] {
  const metrics = ["heartRate", "systolic", "oxygenSaturation", "weight", "bloodGlucose", "painScore"] as const;
  const trends: { metric: string; recentAverage: number | null; previousAverage: number | null; direction: string }[] = [];

  for (const metric of metrics) {
    const values = memories
      .map((m) => {
        const v = (m as any).vitalSigns?.[metric];
        return v != null ? Number(v) : null;
      })
      .filter((v): v is number => v != null);

    if (values.length < 2) {
      trends.push({ metric, recentAverage: null, previousAverage: null, direction: "insufficient_data" });
      continue;
    }

    const mid = Math.floor(values.length / 2);
    const recent = values.slice(0, mid);
    const previous = values.slice(mid);
    const recentAvg = recent.length > 0 ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length * 10) / 10 : null;
    const prevAvg = previous.length > 0 ? Math.round(previous.reduce((a, b) => a + b, 0) / previous.length * 10) / 10 : null;

    let direction = "stable";
    if (recentAvg != null && prevAvg != null) {
      const diff = recentAvg - prevAvg;
      const pct = prevAvg !== 0 ? Math.abs(diff / prevAvg) : Math.abs(diff);
      if (pct > 0.05) {
        direction = diff > 0 ? "increasing" : "decreasing";
      }
    }

    trends.push({ metric: metric, recentAverage: recentAvg, previousAverage: prevAvg, direction });
  }

  return trends;
}

// ─── Local trend analysis (non-AI, deterministic) ───

export interface LocalTrend {
  metric: string;
  label: string;
  values: { date: string; value: number }[];
  average: number | null;
  min: number | null;
  max: number | null;
  trend: "improving" | "worsening" | "stable" | "insufficient_data";
  changePercent: number | null;
}

export function computeSymptomTrends(memories: MedicalMemory[]): LocalTrend[] {
  const symptomByName = new Map<string, { date: string; value: number }[]>();

  for (const m of memories) {
    const date = new Date(m.consultationDate).toISOString().split("T")[0];
    if (!m.symptoms) continue;
    for (const s of m.symptoms) {
      const key = s.name;
      if (!symptomByName.has(key)) symptomByName.set(key, []);
      symptomByName.get(key)!.push({ date, value: severityWeight(s.severity) });
    }
  }

  return Array.from(symptomByName.entries()).map(([name, values]) => {
    values.sort((a, b) => a.date.localeCompare(b.date));
    const nums = values.map((v) => v.value);
    const avg = nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10 : null;
    const min = nums.length > 0 ? Math.min(...nums) : null;
    const max = nums.length > 0 ? Math.max(...nums) : null;

    let trend: LocalTrend["trend"] = "insufficient_data";
    let changePercent: number | null = null;
    if (values.length >= 3) {
      const firstHalf = nums.slice(0, Math.floor(nums.length / 2));
      const secondHalf = nums.slice(Math.floor(nums.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      changePercent = firstAvg > 0 ? Math.round((secondAvg - firstAvg) / firstAvg * 100) : 0;
      if (changePercent < -10) trend = "improving";
      else if (changePercent > 10) trend = "worsening";
      else trend = "stable";
    }

    return { metric: `symptom:${name}`, label: name, values, average: avg, min, max, trend, changePercent };
  }).sort((a, b) => (b.values.length) - (a.values.length));
}

function severityWeight(severity: string): number {
  switch (severity?.toLowerCase()) {
    case "critical": return 5;
    case "severe": return 4;
    case "moderate": return 3;
    case "mild": return 2;
    default: return 1;
  }
}

// ─── Overall health score calculation ───

export function calculateOverallHealthScore(memories: MedicalMemory[]): {
  score: number;
  riskLevel: string;
  activeConcerns: number;
  stableConditions: number;
  recentImprovements: string[];
  focusAreas: string[];
} {
  if (memories.length === 0) {
    return { score: 50, riskLevel: "not_assessed", activeConcerns: 0, stableConditions: 0, recentImprovements: [], focusAreas: ["Complete a health consultation to establish baseline"] };
  }

  const riskScores = memories.filter((m) => m.riskScore != null).map((m) => m.riskScore!);
  const avgRisk = riskScores.length > 0 ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length : 50;

  const activeConditions = new Set<string>();
  const stableConditions = new Set<string>();
  const improvements: string[] = [];
  const latestDate = memories.reduce((latest, m) => {
    const d = new Date(m.consultationDate);
    return d > latest ? d : latest;
  }, new Date(0));
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  for (const m of memories) {
    const date = new Date(m.consultationDate);
    if (m.diagnoses) {
      for (const d of m.diagnoses) {
        if (date >= sixMonthsAgo) {
          activeConditions.add(d.name);
        } else {
          stableConditions.add(d.name);
        }
      }
    }
    if (m.recoveryStatus === "excellent" || m.recoveryStatus === "good") {
      if (m.chiefComplaint && date >= sixMonthsAgo) {
        improvements.push(m.chiefComplaint.slice(0, 60));
      }
    }
  }

  // Health score: invert and normalize risk (0 risk = 100 score, 100 risk = 0 score)
  const score = Math.max(0, Math.min(100, Math.round(100 - avgRisk + 10)));

  const focusAreas: string[] = [];
  if (avgRisk > 60) focusAreas.push("Blood pressure monitoring");
  if (activeConditions.size > 3) focusAreas.push("Consider consolidating care with a primary care physician");
  if (memories.filter((m) => m.symptoms?.length).length > 5) focusAreas.push("Symptom tracking and pattern recognition");
  if (improvements.length === 0) focusAreas.push("Establish health improvement goals");

  return {
    score,
    riskLevel: avgRisk > 70 ? "elevated" : avgRisk > 40 ? "moderate" : "low",
    activeConcerns: activeConditions.size,
    stableConditions: stableConditions.size,
    recentImprovements: improvements.slice(0, 3),
    focusAreas: focusAreas.slice(0, 3),
  };
}
