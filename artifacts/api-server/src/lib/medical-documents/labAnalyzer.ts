import { db, docLabValuesTable, docUploadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { LabValue, LabClassification } from "./types";

interface LabPattern {
  patterns: RegExp[];
  category: string;
  normalLow: number;
  normalHigh: number;
  criticalLow?: number;
  criticalHigh?: number;
  unit: string;
}

const LAB_PATTERNS: Record<string, LabPattern> = {
  hemoglobin: {
    patterns: [/hemoglobin/i, /hb\b/i, /hgb/i],
    category: "hematology",
    normalLow: 12, normalHigh: 16, unit: "g/dL",
    criticalLow: 7, criticalHigh: 20,
  },
  wbc: {
    patterns: [/wbc/i, /white\s*blood\s*cell/i, /leukocyte/i],
    category: "hematology",
    normalLow: 4.0, normalHigh: 11.0, unit: "×10³/µL",
    criticalLow: 1.0, criticalHigh: 50.0,
  },
  platelet: {
    patterns: [/platelet/i, /plt/i, /thrombocyte/i],
    category: "hematology",
    normalLow: 150, normalHigh: 450, unit: "×10³/µL",
    criticalLow: 20, criticalHigh: 1000,
  },
  glucose: {
    patterns: [/glucose/i, /blood\s*sugar/i, /fasting\s*glucose/i, /fbs/i],
    category: "chemistry",
    normalLow: 70, normalHigh: 100, unit: "mg/dL",
    criticalLow: 40, criticalHigh: 500,
  },
  creatinine: {
    patterns: [/creatinine/i, /crea/i],
    category: "renal",
    normalLow: 0.6, normalHigh: 1.2, unit: "mg/dL",
    criticalLow: undefined, criticalHigh: 4.0,
  },
  bun: {
    patterns: [/bun\b/i, /blood\s*urea\s*nitrogen/i, /urea/i],
    category: "renal",
    normalLow: 7, normalHigh: 20, unit: "mg/dL",
    criticalLow: undefined, criticalHigh: 100,
  },
  sodium: {
    patterns: [/sodium/i, /na\+?/i],
    category: "electrolytes",
    normalLow: 136, normalHigh: 145, unit: "mEq/L",
    criticalLow: 120, criticalHigh: 160,
  },
  potassium: {
    patterns: [/potassium/i, /k\+?/i],
    category: "electrolytes",
    normalLow: 3.5, normalHigh: 5.1, unit: "mEq/L",
    criticalLow: 2.5, criticalHigh: 6.5,
  },
  cholesterol: {
    patterns: [/total\s*cholesterol/i, /cholesterol/i],
    category: "lipid",
    normalLow: 0, normalHigh: 200, unit: "mg/dL",
    criticalLow: undefined, criticalHigh: 400,
  },
  ldl: {
    patterns: [/ldl/i, /low-density\s*lipoprotein/i],
    category: "lipid",
    normalLow: 0, normalHigh: 100, unit: "mg/dL",
    criticalLow: undefined, criticalHigh: 190,
  },
  hdl: {
    patterns: [/hdl/i, /high-density\s*lipoprotein/i],
    category: "lipid",
    normalLow: 40, normalHigh: 60, unit: "mg/dL",
    criticalLow: 20, criticalHigh: undefined,
  },
  triglycerides: {
    patterns: [/triglyceride/i, /tg\b/i],
    category: "lipid",
    normalLow: 0, normalHigh: 150, unit: "mg/dL",
    criticalLow: undefined, criticalHigh: 500,
  },
  alt: {
    patterns: [/alt/i, /alanine\s*aminotransferase/i, /sgpt/i],
    category: "liver",
    normalLow: 7, normalHigh: 56, unit: "U/L",
    criticalLow: undefined, criticalHigh: 500,
  },
  ast: {
    patterns: [/ast/i, /aspartate\s*aminotransferase/i, /sgot/i],
    category: "liver",
    normalLow: 10, normalHigh: 40, unit: "U/L",
    criticalLow: undefined, criticalHigh: 500,
  },
  tsh: {
    patterns: [/tsh/i, /thyroid\s*stimulating\s*hormone/i],
    category: "endocrine",
    normalLow: 0.4, normalHigh: 4.5, unit: "mIU/L",
    criticalLow: undefined, criticalHigh: 100,
  },
};

const PATIENT_EXPLANATIONS: Record<string, (low: number, high: number) => string> = {
  hemoglobin: () =>
    "Hemoglobin carries oxygen throughout your body. Low levels may suggest anemia, which can cause fatigue and weakness. High levels may indicate dehydration or other conditions. Your doctor should interpret this result based on your overall health.",
  wbc: () =>
    "White blood cells help fight infection. Low levels may suggest a weakened immune system, while high levels often indicate an ongoing infection or inflammation in the body.",
  platelet: () =>
    "Platelets help your blood clot. Low levels may increase bleeding risk, while high levels may increase clotting risk. These results require clinical correlation.",
  glucose: (low, high) =>
    `Blood glucose measures sugar levels. Normal fasting range is ${low}–${high} mg/dL. Low levels (hypoglycemia) can cause dizziness and confusion. High levels (hyperglycemia) may indicate diabetes or prediabetes.`,
  creatinine: () =>
    "Creatinine is a waste product filtered by your kidneys. Elevated levels may suggest reduced kidney function. Dehydration and high protein intake can also affect levels.",
  potassium: () =>
    "Potassium is essential for heart and muscle function. Abnormal levels can affect heart rhythm and require medical attention.",
  sodium: () =>
    "Sodium helps regulate fluid balance and nerve function. Abnormal levels may affect blood pressure and brain function.",
  cholesterol: () =>
    "Cholesterol is a fatty substance in your blood. High levels may increase your risk of heart disease and stroke. Diet, exercise, and medications can help manage levels.",
  alt: () =>
    "ALT is a liver enzyme. Elevated levels may suggest liver inflammation or damage. Many factors can affect ALT including medications, alcohol, and viral infections.",
};

export class LabAnalyzer {
  async analyze(documentId: string, text: string): Promise<LabValue[]> {
    const labValues: LabValue[] = [];
    const lines = text.split("\n");

    for (const line of lines) {
      for (const [, pattern] of Object.entries(LAB_PATTERNS)) {
        for (const regex of pattern.patterns) {
          const match = line.match(regex);
          if (match) {
            const valueMatch = line.match(/([0-9.]+)\s*([<>=])?\s*([0-9.]+)?/);
            if (valueMatch) {
              const rawValue = valueMatch[3] || valueMatch[1];
              const numericValue = parseFloat(rawValue);
              if (!isNaN(numericValue)) {
                const labValue = this.classifyValue(
                  pattern, numericValue, match[0].trim(), line
                );
                labValues.push(labValue);
              }
            }
            break;
          }
        }
      }
    }

    const uniqueTests = this.deduplicate(labValues);
    await this.persist(documentId, uniqueTests);

    await db.update(docUploadsTable)
      .set({ status: "analyzed", updatedAt: new Date() })
      .where(eq(docUploadsTable.id, documentId));

    return uniqueTests;
  }

  private classifyValue(
    pattern: LabPattern, numericValue: number, testName: string, line: string
  ): LabValue {
    let classification: LabClassification = "normal";
    let isAbnormal = false;

    if (pattern.criticalLow !== undefined && numericValue < pattern.criticalLow) {
      classification = "critical_low"; isAbnormal = true;
    } else if (pattern.criticalHigh !== undefined && numericValue > pattern.criticalHigh) {
      classification = "critical_high"; isAbnormal = true;
    } else if (numericValue < pattern.normalLow) {
      classification = "low"; isAbnormal = true;
    } else if (numericValue > pattern.normalHigh) {
      classification = "high"; isAbnormal = true;
    }

    const rangeMatch = line.match(/\(?\s*([0-9.]+\s*[-–]\s*[0-9.]+)\s*\)?/);
    const referenceRange = rangeMatch ? rangeMatch[1] : `${pattern.normalLow}–${pattern.normalHigh}`;

    const explanation = this.generateExplanation(testName, classification, numericValue, pattern);
    const patientExplanation = this.generatePatientExplanation(testName, classification, pattern);

    return {
      testName: testName.charAt(0).toUpperCase() + testName.slice(1),
      testCategory: pattern.category,
      value: String(numericValue),
      numericValue,
      unit: pattern.unit,
      referenceRange,
      referenceLow: pattern.normalLow,
      referenceHigh: pattern.normalHigh,
      classification,
      isAbnormal,
      confidence: 0.85,
      sourceLocation: line.slice(0, 100),
      explanation,
      patientExplanation,
    };
  }

  private generateExplanation(
    testName: string, classification: LabClassification, value: number, pattern: LabPattern
  ): string {
    switch (classification) {
      case "critical_low":
        return `${testName} is critically low at ${value} ${pattern.unit}. This requires immediate medical attention.`;
      case "critical_high":
        return `${testName} is critically high at ${value} ${pattern.unit}. This requires immediate medical attention.`;
      case "low":
        return `${testName} is below the reference range (${pattern.normalLow}–${pattern.normalHigh} ${pattern.unit}). This may indicate an underlying condition that your doctor should evaluate.`;
      case "high":
        return `${testName} is above the reference range (${pattern.normalLow}–${pattern.normalHigh} ${pattern.unit}). This may indicate an underlying condition that your doctor should evaluate.`;
      case "borderline":
        return `${testName} is at the boundary of the reference range (${pattern.normalLow}–${pattern.normalHigh} ${pattern.unit}). Monitoring may be recommended.`;
      default:
        return `${testName} is within the normal reference range (${pattern.normalLow}–${pattern.normalHigh} ${pattern.unit}).`;
    }
  }

  private generatePatientExplanation(
    testName: string, classification: LabClassification, pattern: LabPattern
  ): string {
    if (classification === "normal") {
      return `Your ${testName.toLowerCase()} level is within the normal range. No action needed based on this result alone.`;
    }
    const key = Object.entries(LAB_PATTERNS).find(([, p]) => p === pattern)?.[0];
    const generator = key ? PATIENT_EXPLANATIONS[key] : undefined;
    const base = generator
      ? generator(pattern.normalLow, pattern.normalHigh)
      : `Your ${testName.toLowerCase()} level is outside the normal reference range. This finding can have multiple causes and should be interpreted by your healthcare provider together with your symptoms and medical history.`;

    if (classification === "critical_low" || classification === "critical_high") {
      return `[ATTENTION] ${base} This value is critically abnormal — please seek immediate medical evaluation.`;
    }
    return base;
  }

  private deduplicate(values: LabValue[]): LabValue[] {
    const seen = new Set<string>();
    return values.filter((v) => {
      const key = `${v.testName}|${v.value}|${v.unit}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async persist(documentId: string, values: LabValue[]): Promise<void> {
    for (const v of values) {
      await db.insert(docLabValuesTable).values({
        documentId,
        testName: v.testName,
        testCategory: v.testCategory,
        value: v.value,
        unit: v.unit,
        referenceRange: v.referenceRange,
        referenceLow: v.referenceLow,
        referenceHigh: v.referenceHigh,
        classification: v.classification,
        isAbnormal: v.isAbnormal,
        confidence: v.confidence,
        sourceLocation: v.sourceLocation,
        explanation: v.explanation,
        patientExplanation: v.patientExplanation,
      });
    }
  }

  async getLabValues(documentId: string): Promise<LabValue[]> {
    const rows = await db.select().from(docLabValuesTable)
      .where(eq(docLabValuesTable.documentId, documentId))
      .orderBy(docLabValuesTable.createdAt);
    return rows.map((r) => ({
      id: r.id,
      testName: r.testName,
      testCategory: r.testCategory || undefined,
      value: r.value,
      unit: r.unit || undefined,
      referenceRange: r.referenceRange || undefined,
      referenceLow: r.referenceLow || undefined,
      referenceHigh: r.referenceHigh || undefined,
      classification: r.classification as LabClassification,
      isAbnormal: r.isAbnormal ?? false,
      confidence: r.confidence || 0,
      sourceLocation: r.sourceLocation || undefined,
      explanation: r.explanation || undefined,
      patientExplanation: r.patientExplanation || undefined,
    }));
  }
}
