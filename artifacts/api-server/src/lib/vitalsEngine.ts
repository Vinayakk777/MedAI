import { generateJSON } from "./aiClient";

const ENGINE_TIMEOUT_MS = 14_000;

export type SeverityLevel = "normal" | "mildly_abnormal" | "moderately_abnormal" | "critical";

export interface ReferenceRange {
  min: number;
  max: number;
  unit: string;
  label: string;
}

export interface VitalsAssessment {
  heartRate: number | null;
  systolic: number | null;
  diastolic: number | null;
  respiratoryRate: number | null;
  temperature: number | null;
  oxygenSaturation: number | null;
  bloodGlucose: number | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  waistCircumference: number | null;
  painScore: number | null;
  source: string;
  recordedAt: string;
}

export interface VitalsAnalysis {
  heartRate: VitalsMetricResult | null;
  bloodPressure: VitalsMetricResult | null;
  respiratoryRate: VitalsMetricResult | null;
  temperature: VitalsMetricResult | null;
  oxygenSaturation: VitalsMetricResult | null;
  bloodGlucose: VitalsMetricResult | null;
  bmi: VitalsMetricResult | null;
  waistCircumference: VitalsMetricResult | null;
  painScore: VitalsMetricResult | null;
}

export interface VitalsMetricResult {
  value: number | null;
  severity: SeverityLevel;
  referenceRange: ReferenceRange;
  interpretation: string;
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface TrendAnalysis {
  metric: string;
  trend: "improving" | "worsening" | "stable" | "insufficient_data";
  changePercent: number | null;
  currentValue: number | null;
  previousValue: number | null;
  insight: string;
}

export interface VitalsAlert {
  metric: string;
  value: number | null;
  severity: SeverityLevel;
  contextualExplanation: string;
}

export interface VitalsInsightsResult {
  assessments: VitalsAnalysis;
  trendAnalyses: TrendAnalysis[];
  alerts: VitalsAlert[];
  healthScore: number;
  healthScoreExplanation: string;
  missingMeasurements: string[];
  summary: string;
  disclaimer: string;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function severityScore(s: SeverityLevel): number {
  return s === "normal" ? 0 : s === "mildly_abnormal" ? 1 : s === "moderately_abnormal" ? 2 : 3;
}

const REFERENCE_RANGES: Record<string, { min: number; max: number; unit: string; label: string }> = {
  heartRate: { min: 60, max: 100, unit: "bpm", label: "Heart Rate" },
  systolic: { min: 90, max: 120, unit: "mmHg", label: "Systolic BP" },
  diastolic: { min: 60, max: 80, unit: "mmHg", label: "Diastolic BP" },
  respiratoryRate: { min: 12, max: 20, unit: "breaths/min", label: "Respiratory Rate" },
  temperature: { min: 36.5, max: 37.5, unit: "°C", label: "Temperature" },
  oxygenSaturation: { min: 95, max: 100, unit: "%", label: "Oxygen Saturation" },
  bloodGlucoseFasting: { min: 3.9, max: 6.1, unit: "mmol/L", label: "Blood Glucose (Fasting)" },
  bloodGlucoseRandom: { min: 3.9, max: 11.1, unit: "mmol/L", label: "Blood Glucose (Random)" },
  bmi: { min: 18.5, max: 24.9, unit: "kg/m²", label: "BMI" },
  waistCircumference: { min: 0, max: 94, unit: "cm", label: "Waist Circumference" },
  painScore: { min: 0, max: 0, unit: "/10", label: "Pain Score" },
};

function assessMetric(
  value: number | null,
  range: { min: number; max: number; unit: string; label: string },
  thresholds?: { mild: [number, number]; moderate: [number, number]; critical: [number, number] },
): VitalsMetricResult | null {
  if (value == null) return null;

  const defaultThresholds = {
    mild: [range.min * 0.85, range.max * 1.12] as [number, number],
    moderate: [range.min * 0.7, range.max * 1.25] as [number, number],
    critical: [range.min * 0.5, range.max * 1.5] as [number, number],
  };

  const t = thresholds || defaultThresholds;
  const inRange = value >= range.min && value <= range.max;

  let severity: SeverityLevel;
  let interpretation: string;

  if (inRange) {
    severity = "normal";
    interpretation = `Your ${range.label} of ${value} ${range.unit} is within the normal range (${range.min}–${range.max} ${range.unit}).`;
  } else if (value < t.critical[0] || value > t.critical[1]) {
    severity = "critical";
    interpretation = `Your ${range.label} of ${value} ${range.unit} is critically outside the normal range (${range.min}–${range.max} ${range.unit}). This requires immediate medical attention.`;
  } else if (value < t.moderate[0] || value > t.moderate[1]) {
    severity = "moderately_abnormal";
    interpretation = `Your ${range.label} of ${value} ${range.unit} is moderately outside the normal range (${range.min}–${range.max} ${range.unit}). This should be evaluated by a healthcare professional.`;
  } else if (value < t.mild[0] || value > t.mild[1]) {
    severity = "mildly_abnormal";
    interpretation = `Your ${range.label} of ${value} ${range.unit} is slightly outside the normal range (${range.min}–${range.max} ${range.unit}). Continue to monitor.`;
  } else {
    severity = "normal";
    interpretation = `Your ${range.label} of ${value} ${range.unit} is within the normal range.`;
  }

  return { value, severity, referenceRange: { ...range }, interpretation };
}

function assessTemperature(celsius: number | null): VitalsMetricResult | null {
  if (celsius == null) return null;
  let severity: SeverityLevel;
  let interpretation: string;
  const f = celsius * 9 / 5 + 32;

  if (celsius >= 36.5 && celsius <= 37.5) {
    severity = "normal";
    interpretation = `Your temperature of ${f.toFixed(1)}°F (${celsius.toFixed(1)}°C) is within the normal range (97.8–99.1°F / 36.5–37.5°C).`;
  } else if (celsius >= 37.6 && celsius <= 38.0) {
    severity = "mildly_abnormal";
    interpretation = `Your temperature of ${f.toFixed(1)}°F (${celsius.toFixed(1)}°C) is slightly elevated (low-grade fever). Monitor for other symptoms.`;
  } else if (celsius > 38.0 && celsius <= 39.0) {
    severity = "moderately_abnormal";
    interpretation = `Your temperature of ${f.toFixed(1)}°F (${celsius.toFixed(1)}°C) indicates a fever. Rest, hydrate, and monitor your symptoms.`;
  } else if (celsius > 39.0) {
    severity = "critical";
    interpretation = `Your temperature of ${f.toFixed(1)}°F (${celsius.toFixed(1)}°C) is a high fever. Seek medical attention if it persists or worsens.`;
  } else if (celsius < 35.0) {
    severity = "critical";
    interpretation = `Your temperature of ${f.toFixed(1)}°F (${celsius.toFixed(1)}°C) is critically low (hypothermia). Seek emergency medical care.`;
  } else {
    severity = "mildly_abnormal";
    interpretation = `Your temperature of ${f.toFixed(1)}°F (${celsius.toFixed(1)}°C) is below the normal range. Keep warm and monitor.`;
  }

  return { value: celsius, severity, referenceRange: { min: 36.5, max: 37.5, unit: "°C", label: "Temperature" }, interpretation };
}

function assessOxygenSat(value: number | null): VitalsMetricResult | null {
  if (value == null) return null;
  let severity: SeverityLevel;
  let interpretation: string;

  if (value >= 95) {
    severity = "normal";
    interpretation = `Your oxygen saturation of ${value}% is within the normal range (95–100%).`;
  } else if (value >= 92) {
    severity = "mildly_abnormal";
    interpretation = `Your oxygen saturation of ${value}% is slightly below normal. If you have respiratory symptoms, monitor closely.`;
  } else if (value >= 88) {
    severity = "moderately_abnormal";
    interpretation = `Your oxygen saturation of ${value}% is concerning. Combined with cough or fever, this may indicate respiratory involvement requiring evaluation.`;
  } else {
    severity = "critical";
    interpretation = `Your oxygen saturation of ${value}% is critically low. This is a medical emergency — seek immediate care.`;
  }

  return { value, severity, referenceRange: { min: 95, max: 100, unit: "%", label: "Oxygen Saturation" }, interpretation };
}

function assessBMI(value: number | null): VitalsMetricResult | null {
  if (value == null) return null;
  let severity: SeverityLevel;
  let interpretation: string;

  if (value >= 18.5 && value <= 24.9) {
    severity = "normal";
    interpretation = `Your BMI of ${value.toFixed(1)} is in the healthy range (18.5–24.9).`;
  } else if (value >= 25 && value <= 29.9) {
    severity = "mildly_abnormal";
    interpretation = `Your BMI of ${value.toFixed(1)} indicates you are overweight (25–29.9). Consider lifestyle modifications.`;
  } else if (value >= 30 && value <= 34.9) {
    severity = "moderately_abnormal";
    interpretation = `Your BMI of ${value.toFixed(1)} indicates obesity Class I. A healthcare provider can help develop a management plan.`;
  } else if (value >= 35) {
    severity = "moderately_abnormal";
    interpretation = `Your BMI of ${value.toFixed(1)} indicates significant obesity. Please consult a healthcare provider.`;
  } else {
    severity = "mildly_abnormal";
    interpretation = `Your BMI of ${value.toFixed(1)} is below the healthy range. A healthcare provider can help assess your nutritional status.`;
  }

  return { value, severity, referenceRange: { min: 18.5, max: 24.9, unit: "kg/m²", label: "BMI" }, interpretation };
}

function assessPainScore(value: number | null): VitalsMetricResult | null {
  if (value == null) return null;
  let severity: SeverityLevel;
  let interpretation: string;

  if (value === 0) {
    severity = "normal";
    interpretation = "You are not experiencing pain.";
  } else if (value <= 3) {
    severity = "mildly_abnormal";
    interpretation = `Your pain level of ${value}/10 is mild. Monitor if it worsens.`;
  } else if (value <= 6) {
    severity = "moderately_abnormal";
    interpretation = `Your pain level of ${value}/10 is moderate. This may interfere with daily activities.`;
  } else {
    severity = "critical";
    interpretation = `Your pain level of ${value}/10 is severe. Seek medical evaluation.`;
  }

  return { value, severity, referenceRange: { min: 0, max: 0, unit: "/10", label: "Pain Score" }, interpretation };
}

export function analyzeCurrentVitals(
  vitals: VitalsAssessment,
): VitalsAnalysis {
  return {
    heartRate: assessMetric(vitals.heartRate, REFERENCE_RANGES.heartRate, { mild: [50, 110], moderate: [40, 130], critical: [30, 150] }),
    bloodPressure: vitals.systolic != null && vitals.diastolic != null
      ? assessBloodPressure(vitals.systolic, vitals.diastolic)
      : null,
    respiratoryRate: assessMetric(vitals.respiratoryRate, REFERENCE_RANGES.respiratoryRate, { mild: [10, 24], moderate: [8, 28], critical: [6, 35] }),
    temperature: assessTemperature(vitals.temperature),
    oxygenSaturation: assessOxygenSat(vitals.oxygenSaturation),
    bloodGlucose: assessMetric(vitals.bloodGlucose, REFERENCE_RANGES.bloodGlucoseRandom, { mild: [3.5, 12], moderate: [3, 14], critical: [2.5, 17] }),
    bmi: assessBMI(vitals.bmi),
    waistCircumference: assessMetric(vitals.waistCircumference, REFERENCE_RANGES.waistCircumference, { mild: [80, 102], moderate: [70, 110], critical: [60, 120] }),
    painScore: assessPainScore(vitals.painScore),
  };
}

function assessBloodPressure(systolic: number, diastolic: number): VitalsMetricResult {
  let severity: SeverityLevel;
  let interpretation: string;

  if (systolic < 120 && diastolic < 80) {
    severity = "normal";
    interpretation = `Your blood pressure of ${systolic}/${diastolic} mmHg is within the normal range (<120/80).`;
  } else if ((systolic >= 120 && systolic <= 129) && diastolic < 80) {
    severity = "mildly_abnormal";
    interpretation = `Your blood pressure of ${systolic}/${diastolic} mmHg is elevated (systolic 120–129). Monitor regularly.`;
  } else if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) {
    severity = "moderately_abnormal";
    interpretation = `Your blood pressure of ${systolic}/${diastolic} mmHg indicates Stage 1 hypertension. Consult a healthcare provider.`;
  } else if (systolic >= 140 || diastolic >= 90) {
    if (systolic >= 180 || diastolic >= 120) {
      severity = "critical";
      interpretation = `Your blood pressure of ${systolic}/${diastolic} mmHg is critically high (hypertensive crisis). Seek emergency medical care.`;
    } else {
      severity = "moderately_abnormal";
      interpretation = `Your blood pressure of ${systolic}/${diastolic} mmHg indicates Stage 2 hypertension. Please consult a healthcare provider.`;
    }
  } else {
    severity = "normal";
    interpretation = `Your blood pressure of ${systolic}/${diastolic} mmHg is acceptable.`;
  }

  return { value: systolic, severity, referenceRange: { min: 90, max: 120, unit: "mmHg", label: "Blood Pressure" }, interpretation };
}

export function calculateTrends(
  current: VitalsAssessment,
  history: VitalsAssessment[],
): TrendAnalysis[] {
  if (history.length === 0) {
    return [
      { metric: "Heart Rate", trend: "insufficient_data", changePercent: null, currentValue: current.heartRate, previousValue: null, insight: "No historical data available for trend analysis." },
      { metric: "Blood Pressure", trend: "insufficient_data", changePercent: null, currentValue: current.systolic, previousValue: null, insight: "No historical data available for trend analysis." },
    ];
  }

  const previous = history[0];
  const metrics: { metric: string; current: number | null; previous: number | null }[] = [
    { metric: "Heart Rate", current: current.heartRate, previous: previous.heartRate },
    { metric: "Systolic BP", current: current.systolic, previous: previous.systolic },
    { metric: "Diastolic BP", current: current.diastolic, previous: previous.diastolic },
    { metric: "Temperature", current: current.temperature, previous: previous.temperature },
    { metric: "Oxygen Saturation", current: current.oxygenSaturation, previous: previous.oxygenSaturation },
    { metric: "Blood Glucose", current: current.bloodGlucose, previous: previous.bloodGlucose },
    { metric: "Weight", current: current.weight, previous: previous.weight },
    { metric: "BMI", current: current.bmi, previous: previous.bmi },
    { metric: "Respiratory Rate", current: current.respiratoryRate, previous: previous.respiratoryRate },
  ];

  return metrics.map((m) => {
    if (m.current == null || m.previous == null || m.previous === 0) {
      return {
        metric: m.metric,
        trend: "insufficient_data" as const,
        changePercent: null,
        currentValue: m.current,
        previousValue: m.previous,
        insight: m.current == null ? "No current measurement available." : "No prior data for comparison.",
      };
    }

    const changePercent = ((m.current - m.previous) / m.previous) * 100;
    const absChange = Math.abs(changePercent);
    let trend: "improving" | "worsening" | "stable";
    let insight: string;

    if (absChange < 2) {
      trend = "stable";
      insight = `Your ${m.metric} has remained stable (${changePercent > 0 ? "+" : ""}${changePercent.toFixed(1)}% change).`;
    } else if ((m.metric === "Heart Rate" || m.metric === "Systolic BP" || m.metric === "Diastolic BP" || m.metric === "Temperature" || m.metric === "Respiratory Rate" || m.metric === "Blood Glucose") && changePercent < 0) {
      trend = "improving";
      insight = `Your ${m.metric} has decreased by ${absChange.toFixed(1)}%, which may indicate improvement.`;
    } else if (m.metric === "Oxygen Saturation" && changePercent > 0) {
      trend = "improving";
      insight = `Your ${m.metric} has increased by ${absChange.toFixed(1)}%, which is a positive trend.`;
    } else if (m.metric === "Oxygen Saturation" && changePercent < 0) {
      trend = "worsening";
      insight = `Your ${m.metric} has decreased by ${absChange.toFixed(1)}%. This may indicate worsening respiratory function. Monitor closely.`;
    } else if (changePercent > 0 && (m.metric === "Heart Rate" || m.metric === "Systolic BP" || m.metric === "Diastolic BP" || m.metric === "Temperature" || m.metric === "Respiratory Rate" || m.metric === "Blood Glucose")) {
      trend = "worsening";
      insight = `Your ${m.metric} has increased by ${absChange.toFixed(1)}%. Please monitor this trend.`;
    } else {
      trend = "stable";
      insight = `Your ${m.metric} shows a change of ${absChange.toFixed(1)}%. Continue routine monitoring.`;
    }

    return { metric: m.metric, trend, changePercent, currentValue: m.current, previousValue: m.previous, insight };
  });
}

export function generateAlerts(
  analysis: VitalsAnalysis,
  recentSymptoms?: string[],
): VitalsAlert[] {
  const alerts: VitalsAlert[] = [];
  const metrics = [
    { key: "heartRate", label: "Heart Rate", result: analysis.heartRate },
    { key: "bloodPressure", label: "Blood Pressure", result: analysis.bloodPressure },
    { key: "respiratoryRate", label: "Respiratory Rate", result: analysis.respiratoryRate },
    { key: "temperature", label: "Temperature", result: analysis.temperature },
    { key: "oxygenSaturation", label: "Oxygen Saturation", result: analysis.oxygenSaturation },
    { key: "bloodGlucose", label: "Blood Glucose", result: analysis.bloodGlucose },
    { key: "bmi", label: "BMI", result: analysis.bmi },
    { key: "painScore", label: "Pain Score", result: analysis.painScore },
  ] as const;

  for (const m of metrics) {
    if (!m.result || m.result.severity === "normal") continue;
    const symptoms = recentSymptoms?.length ? recentSymptoms.join(", ") : "your symptoms";
    let contextualExplanation = m.result.interpretation;

    if (m.key === "oxygenSaturation" && recentSymptoms?.some(s => /cough|fever|breath|respiratory/i.test(s))) {
      contextualExplanation = `Your oxygen saturation is lower than the normal range. Combined with your ${symptoms}, this may indicate worsening respiratory involvement and should be evaluated promptly.`;
    }
    if (m.key === "bloodPressure" && recentSymptoms?.some(s => /chest pain|chest tightness|heart|palpitations/i.test(s))) {
      contextualExplanation = `Your blood pressure is elevated. Combined with your ${symptoms}, this warrants cardiovascular evaluation.`;
    }
    if (m.key === "bloodGlucose" && recentSymptoms?.some(s => /infection|fever|wound|urinary/i.test(s))) {
      contextualExplanation = `Your blood glucose is abnormal. With your ${symptoms}, this may indicate poor diabetic control that needs attention.`;
    }
    if (m.key === "heartRate" && analysis.temperature?.severity && analysis.temperature.severity !== "normal") {
      contextualExplanation = `Your heart rate is elevated alongside a ${analysis.temperature?.severity === "critical" ? "high" : "mild"} fever. This is a normal physiological response to increased metabolic demand during illness.`;
    }

    alerts.push({ metric: m.label, value: m.result.value, severity: m.result.severity, contextualExplanation });
  }

  return alerts;
}

export function calculateHealthScore(
  analysis: VitalsAnalysis,
  trends: TrendAnalysis[],
): { healthScore: number; explanation: string } {
  let score = 100;
  const factors: string[] = [];

  const metrics = [
    analysis.heartRate, analysis.bloodPressure, analysis.respiratoryRate,
    analysis.temperature, analysis.oxygenSaturation, analysis.bloodGlucose,
    analysis.bmi, analysis.painScore,
  ];
  const present = metrics.filter((m): m is VitalsMetricResult => m !== null);
  if (present.length === 0) {
    return { healthScore: 0, explanation: "No vital signs data available to calculate a health score." };
  }

  for (const m of present) {
    const deduction = severityScore(m.severity) * 8;
    score -= deduction;
    if (m.severity !== "normal") {
      factors.push(`${m.referenceRange.label} is ${m.severity.replace("_", " ")} (-${deduction} pts)`);
    }
  }

  for (const t of trends) {
    if (t.trend === "improving") score += 3;
    if (t.trend === "worsening") score -= 5;
  }

  score = clamp(score, 0, 100);

  let explanation: string;
  if (score >= 85) {
    explanation = "Your vital signs are generally healthy. Continue maintaining your current habits.";
  } else if (score >= 65) {
    explanation = `Your health score is moderate. ${factors.length > 0 ? `Factors affecting your score: ${factors.join("; ")}.` : ""} Consider discussing these with a healthcare provider.`;
  } else if (score >= 40) {
    explanation = `Your health score is below average. ${factors.length > 0 ? `Factors needing attention: ${factors.join("; ")}.` : ""} Please consult a healthcare professional.`;
  } else {
    explanation = `Your health score indicates several abnormal readings requiring attention. ${factors.length > 0 ? `Critical factors: ${factors.join("; ")}.` : ""} Seek medical evaluation.`;
  }

  return { healthScore: Math.round(score), explanation };
}

export function findMissingMeasurements(vitals: VitalsAssessment): string[] {
  const fields: { key: keyof VitalsAssessment; label: string }[] = [
    { key: "heartRate", label: "Heart Rate" },
    { key: "systolic", label: "Blood Pressure" },
    { key: "respiratoryRate", label: "Respiratory Rate" },
    { key: "temperature", label: "Temperature" },
    { key: "oxygenSaturation", label: "Oxygen Saturation" },
    { key: "bloodGlucose", label: "Blood Glucose" },
    { key: "weight", label: "Weight" },
    { key: "bmi", label: "BMI" },
    { key: "waistCircumference", label: "Waist Circumference" },
    { key: "painScore", label: "Pain Score" },
  ];
  return fields.filter((f) => vitals[f.key] == null).map((f) => f.label);
}

export async function generateAIInsights(
  vitals: VitalsAssessment,
  recentSymptoms?: string[],
  history?: VitalsAssessment[],
): Promise<VitalsInsightsResult | null> {
  const analysis = analyzeCurrentVitals(vitals);
  const trends = history ? calculateTrends(vitals, history) : [];
  const alerts = generateAlerts(analysis, recentSymptoms);
  const healthScoreResult = calculateHealthScore(analysis, trends);
  const missing = findMissingMeasurements(vitals);

  if (alerts.length > 0 || healthScoreResult.healthScore < 70) {
    const severityMap: Record<string, string> = {};
    for (const a of alerts) severityMap[a.metric] = a.severity;

    const clinicalContent = `[VITALS DATA]\n${JSON.stringify({
      vitals: {
        heartRate: vitals.heartRate,
        bloodPressure: vitals.systolic != null ? `${vitals.systolic}/${vitals.diastolic}` : null,
        temperature: vitals.temperature,
        oxygenSaturation: vitals.oxygenSaturation,
        bloodGlucose: vitals.bloodGlucose,
        respiratoryRate: vitals.respiratoryRate,
      },
      abnormalValues: severityMap,
      alerts: alerts.map((a) => ({ metric: a.metric, contextualExplanation: a.contextualExplanation })),
      recentSymptoms: recentSymptoms ?? [],
    }, null, 2)}\n[/VITALS DATA]\n\n[HEALTH SCORE]\nScore: ${healthScoreResult.healthScore}\nExplanation: ${healthScoreResult.explanation}\n[/HEALTH SCORE]`;

    const prompt = `You are a clinical decision support specialist. Based on the patient's vital signs data, provide a brief clinical insight summary.

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "summary": "1-2 sentence patient-friendly summary of the vital signs assessment and key recommendations.",
  "disclaimer": "These measurements should not replace professional medical evaluation. Wearable device readings may be inaccurate."
}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ENGINE_TIMEOUT_MS);

    try {
      const aiResult = await generateJSON<{ summary: string; disclaimer: string }>({
        systemPrompt: prompt,
        userContent: clinicalContent,
        temperature: 0.3,
        maxTokens: 512,
        signal: controller.signal,
      });
      clearTimeout(timer);

      return {
        assessments: analysis,
        trendAnalyses: trends,
        alerts,
        healthScore: healthScoreResult.healthScore,
        healthScoreExplanation: healthScoreResult.explanation,
        missingMeasurements: missing,
        summary: aiResult?.summary ?? "Vital signs have been assessed. Continue monitoring as recommended.",
        disclaimer: aiResult?.disclaimer ?? "These measurements are for informational purposes only and should not replace professional medical evaluation. Wearable device readings may be inaccurate.",
      };
    } catch (err) {
      clearTimeout(timer);
      console.error("[vitalsEngine] AI insight generation failed:", err instanceof Error ? err.message : String(err));
    }
  }

  return {
    assessments: analysis,
    trendAnalyses: trends,
    alerts,
    healthScore: healthScoreResult.healthScore,
    healthScoreExplanation: healthScoreResult.explanation,
    missingMeasurements: missing,
    summary: "Your vital signs are within normal ranges. Continue your current health routine and monitor regularly.",
    disclaimer: "These measurements are for informational purposes only and should not replace professional medical evaluation. Wearable device readings may be inaccurate.",
  };
}
