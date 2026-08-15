import { db } from "@workspace/db";
import { eq, and, desc, sql, or, gte, lte } from "drizzle-orm";
import {
  medicalMemoryTable,
  resolvedConditionsTable,
  type MedicalMemory,
  type InsertMedicalMemory,
  type InsertResolvedCondition,
} from "@workspace/db";
import type { ConsultationState } from "./orchestrator";
import { getEffectiveDDx } from "./orchestrator";

// ─── Extraction ───

export function extractMedicalMemory(
  state: ConsultationState,
  userId: string,
  conversationId: string,
): InsertMedicalMemory {
  const ddx = getEffectiveDDx(state);
  const symptoms = state.symptomAnalysis?.allSymptoms.map((s) => ({
    name: s.normalized,
    severity: s.severity ?? "moderate",
    duration: s.duration ?? "",
    bodyLocation: s.bodyLocation,
    progression: s.progression,
  })) ?? [];

  const diagnoses = (ddx?.conditions ?? []).map((c) => ({
    name: c.name,
    confidence: String(c.confidence),
    supportingSymptoms: c.supportingSymptoms ?? [],
    warningSigns: c.warningSigns ?? [],
  }));

  const redFlags = [
    ...(state.escalation?.redFlags.map((f) => f.flag) ?? []),
    ...(state.symptomAnalysis?.emergencyFlags ?? []),
  ];

  const labRecommendations = (state.laboratoryTests?.recommendedTests ?? [])
    .filter((t) => t.category === "laboratory")
    .map((t) => ({ testName: t.testName, priority: t.priority, category: t.category }));

  const imagingRecommendations = (state.laboratoryTests?.recommendedTests ?? [])
    .filter((t) => t.category === "imaging")
    .map((t) => ({ testName: t.testName, priority: t.priority, category: t.category }));

  const medicationRecommendations = (state.otcGuidance?.recommendations ?? []).map((r) => ({
    name: r.genericName,
    purpose: r.purpose,
  }));

  const drugInteractions = (state.otcGuidance?.medicationWarnings ?? []).map((w) => ({
    description: w,
    severity: "moderate" as const,
  }));

  const followUpAdvice = (state.recoveryPlan?.followUpAdvice ?? []).map((f) => ({
    condition: f.condition,
    whenToSeekCare: f.whenToSeekCare,
  }));

  const clinicalProfile = state.symptomAnalysis?.clinicalProfile;

  return {
    userId,
    conversationId,
    consultationDate: new Date(),
    chiefComplaint: state.latestMessage?.slice(0, 500),
    riskLevel: state.healthRiskScore?.riskCategory ?? null,
    riskScore: state.healthRiskScore?.overallScore ?? null,
    outcome: state.careRecommendation?.careRecommendation ?? null,
    followUpStatus: state.recoveryPlan?.recoveryStatus ?? "pending",

    symptoms,
    diagnoses,
    redFlags,

    labRecommendations,
    imagingRecommendations,

    medicationRecommendations,
    drugInteractions,

    allergies: [],
    chronicConditions: clinicalProfile?.medicalHistory ?? [],
    surgicalHistory: [],
    familyHistory: [],

    lifestyleFactors: {
      smoking: undefined,
      alcohol: undefined,
      exercise: undefined,
    },

    followUpAdvice,
    recoveryStatus: state.recoveryPlan?.recoveryStatus ?? null,
    expectedRecoveryDays: state.recoveryPlan?.expectedRecoveryDays ?? null,
  };
}

// ─── Persistence ───

export async function saveMedicalMemory(
  userId: string,
  conversationId: string,
  memory: InsertMedicalMemory,
): Promise<void> {
  await db
    .insert(medicalMemoryTable)
    .values(memory)
    .onConflictDoNothing();
}

// ─── Retrieval: all memories for a user ───

export async function getUserMedicalMemory(
  userId: string,
  options?: { includeArchived?: boolean; includeDeleted?: boolean },
): Promise<MedicalMemory[]> {
  const conditions = [eq(medicalMemoryTable.userId, userId)];
  if (!options?.includeArchived) conditions.push(eq(medicalMemoryTable.isArchived, false));
  if (!options?.includeDeleted) conditions.push(eq(medicalMemoryTable.isDeleted, false));

  return db
    .select()
    .from(medicalMemoryTable)
    .where(and(...conditions))
    .orderBy(desc(medicalMemoryTable.consultationDate));
}

// ─── Retrieval: single memory ───

export async function getMedicalMemoryById(
  id: string,
  userId: string,
): Promise<MedicalMemory | null> {
  const [row] = await db
    .select()
    .from(medicalMemoryTable)
    .where(and(eq(medicalMemoryTable.id, id), eq(medicalMemoryTable.userId, userId)));
  return row ?? null;
}

// ─── Retrieval: search ───

export async function searchMedicalMemory(
  userId: string,
  query: string,
): Promise<MedicalMemory[]> {
  const searchPattern = `%${query.toLowerCase()}%`;
  return db
    .select()
    .from(medicalMemoryTable)
    .where(
      and(
        eq(medicalMemoryTable.userId, userId),
        eq(medicalMemoryTable.isDeleted, false),
        or(
          sql`LOWER(${medicalMemoryTable.chiefComplaint}) LIKE ${searchPattern}`,
          sql`${medicalMemoryTable.symptoms}::text ILIKE ${searchPattern}`,
          sql`${medicalMemoryTable.diagnoses}::text ILIKE ${searchPattern}`,
          sql`${medicalMemoryTable.labRecommendations}::text ILIKE ${searchPattern}`,
        ),
      ),
    )
    .orderBy(desc(medicalMemoryTable.consultationDate));
}

// ─── Retrieval: filter by date range ───

export async function filterMemoryByDateRange(
  userId: string,
  from: Date,
  to: Date,
): Promise<MedicalMemory[]> {
  return db
    .select()
    .from(medicalMemoryTable)
    .where(
      and(
        eq(medicalMemoryTable.userId, userId),
        eq(medicalMemoryTable.isDeleted, false),
        gte(medicalMemoryTable.consultationDate, from),
        lte(medicalMemoryTable.consultationDate, to),
      ),
    )
    .orderBy(desc(medicalMemoryTable.consultationDate));
}

// ─── Retrieval: by symptom ───

export async function filterMemoryBySymptom(
  userId: string,
  symptom: string,
): Promise<MedicalMemory[]> {
  const pattern = `%${symptom.toLowerCase()}%`;
  return db
    .select()
    .from(medicalMemoryTable)
    .where(
      and(
        eq(medicalMemoryTable.userId, userId),
        eq(medicalMemoryTable.isDeleted, false),
        sql`${medicalMemoryTable.symptoms}::text ILIKE ${pattern}`,
      ),
    )
    .orderBy(desc(medicalMemoryTable.consultationDate));
}

// ─── Retrieval: by diagnosis ───

export async function filterMemoryByDiagnosis(
  userId: string,
  diagnosis: string,
): Promise<MedicalMemory[]> {
  const pattern = `%${diagnosis.toLowerCase()}%`;
  return db
    .select()
    .from(medicalMemoryTable)
    .where(
      and(
        eq(medicalMemoryTable.userId, userId),
        eq(medicalMemoryTable.isDeleted, false),
        sql`${medicalMemoryTable.diagnoses}::text ILIKE ${pattern}`,
      ),
    )
    .orderBy(desc(medicalMemoryTable.consultationDate));
}

// ─── Retrieval: aggregate medical history ───

export interface MedicalHistorySummary {
  activeConditions: { name: string; firstRecorded: string; lastRecorded: string; count: number }[];
  pastConditions: { name: string; firstRecorded: string; lastRecorded: string }[];
  resolvedConditions: ResolvedConditionEntry[];
  allergies: string[];
  currentMedications: string[];
  medicationHistory: string[];
  labHistory: string[];
  imagingHistory: string[];
  lifestyleProfile: {
    smoking?: string;
    alcohol?: string;
    exercise?: string;
  };
  totalConsultations: number;
  lastConsultationDate: string | null;
  averageRiskScore: number | null;
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

export async function getMedicalHistorySummary(userId: string): Promise<MedicalHistorySummary> {
  const [memories, resolvedConditions] = await Promise.all([
    getUserMedicalMemory(userId),
    getResolvedConditions(userId),
  ]);

  // Conditions the user explicitly marked as resolved/issue solved. These are
  // removed from the active list but remain visible under past conditions.
  const resolvedKeys = new Set(resolvedConditions.map((r) => toNameKey(r.conditionName)));

  // Aggregate conditions across all memories
  const conditionMap = new Map<string, { count: number; first: Date; last: Date }>();
  const pastConditionSet = new Set<string>();
  const allergySet = new Set<string>();
  const medicationSet = new Set<string>();
  const labSet = new Set<string>();
  const imagingSet = new Set<string>();
  let latestDate: Date | null = null;
  let totalRiskScore = 0;
  let riskCount = 0;

  // Latest lifestyle factors
  let latestLifestyle: { smoking?: string; alcohol?: string; exercise?: string } = {};

  for (const m of memories) {
    const date = new Date(m.consultationDate);
    if (!latestDate || date > latestDate) latestDate = date;

    if (m.riskScore != null) {
      totalRiskScore += m.riskScore;
      riskCount++;
    }

    // Track symptoms as potential conditions
    if (m.symptoms) {
      for (const s of m.symptoms) {
        const key = toNameKey(s.name);
        const existing = conditionMap.get(key);
        if (existing) {
          existing.count++;
          if (date < existing.first) existing.first = date;
          if (date > existing.last) existing.last = date;
        } else {
          conditionMap.set(key, { count: 1, first: date, last: date });
        }
      }
    }

    // Track diagnoses
    if (m.diagnoses) {
      for (const d of m.diagnoses) {
        const key = toNameKey(d.name);
        const existing = conditionMap.get(key);
        if (existing) {
          existing.count++;
          if (date < existing.first) existing.first = date;
          if (date > existing.last) existing.last = date;
        } else {
          conditionMap.set(key, { count: 1, first: date, last: date });
        }
      }
    }

    // Chronic conditions
    if (m.chronicConditions) {
      for (const c of m.chronicConditions) pastConditionSet.add(c);
    }

    // Allergies
    if (m.allergies) {
      for (const a of m.allergies) allergySet.add(a);
    }

    // Medications
    if (m.medicationRecommendations) {
      for (const med of m.medicationRecommendations) {
        medicationSet.add(med.name);
      }
    }

    // Lab history
    if (m.labRecommendations) {
      for (const lab of m.labRecommendations) {
        labSet.add(lab.testName);
      }
    }

    // Imaging history
    if (m.imagingRecommendations) {
      for (const img of m.imagingRecommendations) {
        imagingSet.add(img.testName);
      }
    }

    // Lifestyle - latest non-empty
    if (m.lifestyleFactors) {
      if (m.lifestyleFactors.smoking) latestLifestyle.smoking = m.lifestyleFactors.smoking;
      if (m.lifestyleFactors.alcohol) latestLifestyle.alcohol = m.lifestyleFactors.alcohol;
      if (m.lifestyleFactors.exercise) latestLifestyle.exercise = m.lifestyleFactors.exercise;
    }
  }

  // Separate active (recent, appears 2+) vs past conditions
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const activeConditions: MedicalHistorySummary["activeConditions"] = [];
  const pastConditions: MedicalHistorySummary["pastConditions"] = [];

  for (const [name, info] of conditionMap) {
    if (!resolvedKeys.has(name) && (info.last >= sixMonthsAgo || info.count >= 2)) {
      activeConditions.push({
        name: capitalize(name),
        firstRecorded: info.first.toISOString(),
        lastRecorded: info.last.toISOString(),
        count: info.count,
      });
    } else {
      pastConditions.push({
        name: capitalize(name),
        firstRecorded: info.first.toISOString(),
        lastRecorded: info.last.toISOString(),
      });
    }
  }

  return {
    activeConditions: activeConditions.sort((a, b) => b.count - a.count),
    pastConditions,
    resolvedConditions,
    allergies: [...allergySet].sort(),
    currentMedications: [...medicationSet].sort(),
    medicationHistory: [...medicationSet].sort(),
    labHistory: [...labSet].sort(),
    imagingHistory: [...imagingSet].sort(),
    lifestyleProfile: latestLifestyle,
    totalConsultations: memories.length,
    lastConsultationDate: latestDate?.toISOString() ?? null,
    averageRiskScore: riskCount > 0 ? Math.round(totalRiskScore / riskCount) : null,
  };
}

// ─── Relevant memory retrieval for AI prompt ───

export interface RelevantMemory {
  id: string;
  consultationDate: string;
  chiefComplaint: string | null;
  symptoms: { name: string; severity: string; duration: string }[];
  diagnoses: { name: string; confidence: string }[];
  riskLevel: string | null;
  followUpStatus: string | null;
  medicationRecommendations: { name: string; purpose: string }[];
}

export async function getRelevantMemories(
  userId: string,
  currentSymptoms: string[],
  currentDiagnoses: string[],
  maxMemories = 5,
): Promise<RelevantMemory[]> {
  const allMemories = await getUserMedicalMemory(userId);

  // Score each memory by relevance
  const scored = allMemories.map((m) => {
    let score = 0;
    const symptomNames = m.symptoms?.map((s) => toNameKey(s.name)) ?? [];
    const diagnosisNames = m.diagnoses?.map((d) => toNameKey(d.name)) ?? [];

    // Match current symptoms to historical symptoms
    for (const cs of currentSymptoms) {
      const lower = cs.toLowerCase();
      if (symptomNames.includes(lower)) score += 3;
    }

    // Match current diagnoses to historical diagnoses
    for (const cd of currentDiagnoses) {
      const lower = cd.toLowerCase();
      if (diagnosisNames.includes(lower)) score += 5;
    }

    // Recency bonus
    const daysAgo = (Date.now() - new Date(m.consultationDate).getTime()) / 86400000;
    if (daysAgo < 7) score += 4;
    else if (daysAgo < 30) score += 3;
    else if (daysAgo < 90) score += 2;
    else if (daysAgo < 365) score += 1;

    // Pending follow-up bonus
    if (m.followUpStatus && m.followUpStatus !== "resolved") score += 2;

    return { memory: m, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxMemories).map((s) => ({
    id: s.memory.id,
    consultationDate: s.memory.consultationDate.toISOString(),
    chiefComplaint: s.memory.chiefComplaint,
    symptoms: s.memory.symptoms?.map((sym) => ({
      name: sym.name,
      severity: sym.severity,
      duration: sym.duration,
    })) ?? [],
    diagnoses: s.memory.diagnoses?.map((d) => ({
      name: d.name,
      confidence: d.confidence,
    })) ?? [],
    riskLevel: s.memory.riskLevel,
    followUpStatus: s.memory.followUpStatus,
    medicationRecommendations: s.memory.medicationRecommendations ?? [],
  }));
}

// ─── Format memories for AI prompt ───

export function formatMemoriesForPrompt(memories: RelevantMemory[]): string {
  if (memories.length === 0) return "";

  const parts = memories.map((m, i) => {
    const date = new Date(m.consultationDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const lines: string[] = [
      `Consultation ${i + 1} (${date})`,
      `  Reason: ${m.chiefComplaint ?? "Not recorded"}`,
    ];

    if (m.symptoms.length > 0) {
      const symptomStr = m.symptoms
        .map((s) => `${s.name} (${s.severity}, ${s.duration})`)
        .join(", ");
      lines.push(`  Symptoms: ${symptomStr}`);
    }

    if (m.diagnoses.length > 0) {
      const dxStr = m.diagnoses
        .map((d) => `${d.name} (${d.confidence}% confidence)`)
        .join(", ");
      lines.push(`  Diagnoses considered: ${dxStr}`);
    }

    if (m.riskLevel) {
      lines.push(`  Risk level: ${m.riskLevel}`);
    }

    if (m.followUpStatus && m.followUpStatus !== "resolved") {
      lines.push(`  Follow-up status: ${m.followUpStatus} — needs review`);
    }

    if (m.medicationRecommendations.length > 0) {
      const medStr = m.medicationRecommendations
        .map((med) => med.name)
        .join(", ");
      lines.push(`  Medications discussed: ${medStr}`);
    }

    return lines.join("\n");
  });

  return `[PATIENT HISTORY START]\nThe following are relevant historical consultation records. Use this information when relevant to provide continuity of care. Never fabricate information not present here.\n\n${parts.join("\n\n")}\n\n[PATIENT HISTORY END]`;
}

// ─── Update operations ───

export async function archiveMedicalMemory(id: string, userId: string): Promise<void> {
  await db
    .update(medicalMemoryTable)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(medicalMemoryTable.id, id), eq(medicalMemoryTable.userId, userId)));
}

export async function deleteMedicalMemory(id: string, userId: string): Promise<void> {
  await db
    .update(medicalMemoryTable)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(and(eq(medicalMemoryTable.id, id), eq(medicalMemoryTable.userId, userId)));
}

export async function updateMedicalMemory(
  id: string,
  userId: string,
  updates: Partial<InsertMedicalMemory>,
): Promise<void> {
  await db
    .update(medicalMemoryTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(medicalMemoryTable.id, id), eq(medicalMemoryTable.userId, userId)));
}

// ─── Resolved conditions ───

export interface ResolvedConditionEntry {
  id: string;
  conditionName: string;
  resolvedAt: string;
}

export async function getResolvedConditions(userId: string): Promise<ResolvedConditionEntry[]> {
  const rows = await db
    .select({
      id: resolvedConditionsTable.id,
      conditionName: resolvedConditionsTable.conditionName,
      resolvedAt: resolvedConditionsTable.resolvedAt,
    })
    .from(resolvedConditionsTable)
    .where(
      and(
        eq(resolvedConditionsTable.userId, userId),
        eq(resolvedConditionsTable.isArchived, false),
      ),
    )
    .orderBy(desc(resolvedConditionsTable.resolvedAt));
  return rows.map((r) => ({
    id: r.id,
    conditionName: r.conditionName,
    resolvedAt: r.resolvedAt.toISOString(),
  }));
}

export async function addResolvedCondition(
  userId: string,
  conditionName: string,
  notes?: string,
): Promise<ResolvedConditionEntry> {
  const existing = await db
    .select()
    .from(resolvedConditionsTable)
    .where(
      and(
        eq(resolvedConditionsTable.userId, userId),
        eq(sql`lower(${resolvedConditionsTable.conditionName})`, conditionName.toLowerCase()),
        eq(resolvedConditionsTable.isArchived, false),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return {
      id: existing[0].id,
      conditionName: existing[0].conditionName,
      resolvedAt: existing[0].resolvedAt.toISOString(),
    };
  }

  const row: InsertResolvedCondition = {
    userId,
    conditionName: conditionName.trim(),
    notes: notes ?? null,
  };
  const [inserted] = await db
    .insert(resolvedConditionsTable)
    .values(row)
    .returning({
      id: resolvedConditionsTable.id,
      conditionName: resolvedConditionsTable.conditionName,
      resolvedAt: resolvedConditionsTable.resolvedAt,
    });
  return {
    id: inserted.id,
    conditionName: inserted.conditionName,
    resolvedAt: inserted.resolvedAt.toISOString(),
  };
}

export async function undoResolvedCondition(id: string, userId: string): Promise<void> {
  await db
    .update(resolvedConditionsTable)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(
      and(
        eq(resolvedConditionsTable.id, id),
        eq(resolvedConditionsTable.userId, userId),
        eq(resolvedConditionsTable.isArchived, false),
      ),
    );
}

// ─── Helpers ───

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}


