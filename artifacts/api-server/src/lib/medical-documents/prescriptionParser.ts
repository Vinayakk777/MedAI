import { db, docMedicationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Medication, MedicationIssue } from "./types";

const MEDICATION_NAMES = [
  "amoxicillin", "metformin", "atorvastatin", "lisinopril", "omeprazole",
  "simvastatin", "aspirin", "acetaminophen", "ibuprofen", "levothyroxine",
  "amlodipine", "metoprolol", "losartan", "albuterol", "gabapentin",
  "hydrochlorothiazide", "prednisone", "sertraline", "warfarin", "furosemide",
  "citalopram", "ranitidine", "tramadol", "codeine", "morphine",
  "insulin", "paracetamol", "doxycycline", "azithromycin", "clopidogrel",
];

const KNOWN_INTERACTIONS: [string, string, string][] = [
  ["warfarin", "aspirin", "Increased bleeding risk"],
  ["warfarin", "ibuprofen", "Increased bleeding risk"],
  ["metformin", "contrast dye", "Risk of lactic acidosis"],
  ["lisinopril", "potassium", "Risk of hyperkalemia"],
  ["lisinopril", "spironolactone", "Risk of hyperkalemia"],
  ["simvastatin", "grapefruit", "Increased statin levels, muscle injury risk"],
  ["sertraline", "tramadol", "Serotonin syndrome risk"],
  ["sertraline", "codeine", "Serotonin syndrome risk"],
  ["albuterol", "beta blockers", "Reduced bronchodilator effect"],
  ["metoprolol", "albuterol", "Reduced bronchodilator effect"],
];

export class PrescriptionParser {
  async parse(documentId: string, text: string): Promise<{ medications: Medication[]; issues: MedicationIssue[] }> {
    const medications = this.extractMedications(text);
    const issues = this.detectIssues(medications);
    const deduped = this.deduplicate(medications);

    await this.persist(documentId, deduped);
    return { medications: deduped, issues };
  }

  private extractMedications(text: string): Medication[] {
    const medications: Medication[] = [];
    const lines = text.split("\n");

    for (const line of lines) {
      for (const name of MEDICATION_NAMES) {
        const regex = new RegExp(`\\b${name}\\b`, "gi");
        if (regex.test(line)) {
          const dosage = this.extractDosage(line);
          const frequency = this.extractFrequency(line);
          const duration = this.extractDuration(line);
          const instructions = this.extractInstructions(line);

          medications.push({
            medicationName: name.charAt(0).toUpperCase() + name.slice(1),
            dosage: dosage ? `${dosage.value}${dosage.unit}` : undefined,
            dosageValue: dosage?.value,
            dosageUnit: dosage?.unit,
            frequency,
            duration,
            specialInstructions: instructions,
            isDuplicate: false,
            hasInteraction: false,
            allergyConflict: false,
            missingDosage: !dosage,
            confidence: dosage ? 0.9 : 0.5,
            sourceLocation: line.slice(0, 100),
          });
        }
      }
    }

    return medications;
  }

  private extractDosage(line: string): { value: number; unit: string } | null {
    const match = line.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|IU|unit|tablet|capsule|drop|puff)s?/i);
    if (match) return { value: parseFloat(match[1]), unit: match[2].toLowerCase() };
    return null;
  }

  private extractFrequency(line: string): string | undefined {
    const patterns = [
      /(\d+)\s*(?:times?\s*(?:per|a|\/)\s*(?:day|daily|d))|(\d+)\s*x\s*(?:per|a)\s*(?:day|daily|d)/i,
      /(?:once|twice|three\s*times)\s*(?:a\s*|per\s*)?(?:day|daily|week|night)/i,
      /(?:every|q)\s*(\d+)\s*(?:hour|h)/i,
      /(?:bedtime|hs|prn|as\s*needed|weekly|monthly)/i,
      /(?:bid|tid|qid|qhs|qd|prn|ac|pc)/i,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return match[0].toLowerCase();
    }
    return undefined;
  }

  private extractDuration(line: string): string | undefined {
    const match = line.match(/(?:for|duration)\s*(\d+)\s*(day|week|month|year)s?/i);
    if (match) return `${match[1]} ${match[2]}${parseInt(match[1]) !== 1 ? "s" : ""}`;
    return undefined;
  }

  private extractInstructions(line: string): string | undefined {
    const match = line.match(/(?:take|use|apply|inject)\s*.{5,80}(?:\.|$)/i);
    return match ? match[0].trim() : undefined;
  }

  private detectIssues(medications: Medication[]): MedicationIssue[] {
    const issues: MedicationIssue[] = [];

    const nameCount = new Map<string, number>();
    for (const med of medications) {
      const key = med.medicationName.toLowerCase();
      nameCount.set(key, (nameCount.get(key) || 0) + 1);
    }

    for (const [name, count] of nameCount) {
      if (count > 1) {
        issues.push({
          type: "duplicate",
          severity: "high",
          description: `Duplicate medication detected: ${name} appears ${count} times across prescriptions. Please verify intended dosage.`,
          medicationName: name,
        });
      }
    }

    for (const [a, b, desc] of KNOWN_INTERACTIONS) {
      const hasA = medications.some((m) => m.medicationName.toLowerCase() === a);
      const hasB = medications.some((m) => m.medicationName.toLowerCase() === b);
      if (hasA && hasB) {
        issues.push({
          type: "interaction",
          severity: "high",
          description: desc,
          medicationName: a,
          relatedMedicationName: b,
        });
      }
    }

    for (const med of medications) {
      if (med.missingDosage) {
        issues.push({
          type: "missing_dosage",
          severity: "medium",
          description: `Missing dosage information for ${med.medicationName}. Please verify the prescribed dose.`,
          medicationName: med.medicationName,
        });
      }
    }

    return issues;
  }

  private deduplicate(medications: Medication[]): Medication[] {
    const seen = new Map<string, Medication>();
    for (const med of medications) {
      const key = `${med.medicationName}|${med.dosage}|${med.frequency}`;
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        existing.isDuplicate = true;
        continue;
      }
      seen.set(key, { ...med });
    }
    return Array.from(seen.values());
  }

  private async persist(documentId: string, medications: Medication[]): Promise<void> {
    for (const m of medications) {
      await db.insert(docMedicationsTable).values({
        documentId,
        medicationName: m.medicationName,
        dosage: m.dosage,
        dosageValue: m.dosageValue,
        dosageUnit: m.dosageUnit,
        frequency: m.frequency,
        duration: m.duration,
        specialInstructions: m.specialInstructions,
        isDuplicate: m.isDuplicate,
        hasInteraction: m.hasInteraction,
        allergyConflict: m.allergyConflict,
        missingDosage: m.missingDosage,
        confidence: m.confidence,
        sourceLocation: m.sourceLocation,
      });
    }
  }

  async getMedications(documentId: string): Promise<Medication[]> {
    const rows = await db.select().from(docMedicationsTable)
      .where(eq(docMedicationsTable.documentId, documentId))
      .orderBy(docMedicationsTable.createdAt);
    return rows.map((r) => ({
      id: r.id,
      medicationName: r.medicationName,
      dosage: r.dosage || undefined,
      dosageValue: r.dosageValue || undefined,
      dosageUnit: r.dosageUnit || undefined,
      frequency: r.frequency || undefined,
      route: r.route || undefined,
      duration: r.duration || undefined,
      startDate: r.startDate?.toISOString(),
      endDate: r.endDate?.toISOString(),
      specialInstructions: r.specialInstructions || undefined,
      isDuplicate: r.isDuplicate ?? false,
      duplicateOfId: r.duplicateOfId || undefined,
      hasInteraction: r.hasInteraction ?? false,
      interactionDescription: r.interactionDescription || undefined,
      allergyConflict: r.allergyConflict ?? false,
      allergyDescription: r.allergyDescription || undefined,
      missingDosage: r.missingDosage ?? false,
      confidence: r.confidence || 0,
      sourceLocation: r.sourceLocation || undefined,
    }));
  }
}
